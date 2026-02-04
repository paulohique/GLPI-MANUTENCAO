from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from datetime import datetime, timedelta
from typing import List, Optional
import logging
import asyncio

from database import engine, get_db, Base, SessionLocal
from models import Computer, ComputerComponent, MaintenanceHistory, ComputerNote
from schemas import (
    ComputerOut, ComponentOut, MaintenanceCreate, MaintenanceOut,
    NoteCreate, NoteOut, DevicesPage, DeviceRow, DeviceDetail, SyncResult,
    NoteUpdate, MaintenanceUpdate, SyncStatus
)
from glpi_client import GlpiClient
from config import settings

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Criar tabelas
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="GLPI Manutenções API",
    description="API para gerenciamento de manutenção de computadores integrada ao GLPI",
    version="1.0.0"
)

# CORS
origins = settings.CORS_ORIGINS.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== SYNC GLPI ====================

_sync_lock = asyncio.Lock()
_sync_state = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "computers_synced": 0,
    "components_synced": 0,
    "current_glpi_id": None,
    "message": None,
    "last_error": None,
}


def _dropdown_str(value) -> str:
    """Normaliza valores do GLPI (IDs, dicts com name, None) para string segura."""
    if value is None:
        return ""
    if isinstance(value, dict):
        # GLPI pode retornar dropdown expandido como objeto
        for key in ("completename", "name", "label"):
            v = value.get(key)
            if v:
                return str(v)
        if "id" in value and value.get("id") is not None:
            return str(value.get("id"))
        return ""
    return str(value)


def _set_sync_state(**kwargs):
    _sync_state.update(kwargs)


def _get_sync_status() -> SyncStatus:
    return SyncStatus(**_sync_state)


async def _sync_glpi_computers_impl(db: Session) -> SyncResult:
    """Sincroniza computadores do GLPI com o banco de dados local"""
    glpi = GlpiClient()
    computers_synced = 0
    components_synced = 0

    _set_sync_state(
        running=True,
        started_at=datetime.utcnow(),
        finished_at=None,
        computers_synced=0,
        components_synced=0,
        current_glpi_id=None,
        message="Sincronização em andamento",
        last_error=None,
    )

    try:
        await glpi.init_session()

        # Buscar computadores do GLPI (paginação)
        start = 0
        limit = 50

        while True:
            computers_data = await glpi.get_computers(start=start, limit=limit)

            if not computers_data:
                break

            for comp_data in computers_data:
                glpi_id = comp_data.get("id")
                if not glpi_id:
                    continue

                _set_sync_state(current_glpi_id=int(glpi_id))

                # Verificar se computador já existe
                computer = db.query(Computer).filter(Computer.glpi_id == glpi_id).first()

                if not computer:
                    computer = Computer(glpi_id=glpi_id)
                    db.add(computer)

                # Atualizar dados
                computer.name = (comp_data.get("name") or f"Computer-{glpi_id}")
                computer.entity = _dropdown_str(comp_data.get("entities_id"))
                computer.patrimonio = _dropdown_str(comp_data.get("otherserial"))
                computer.serial = _dropdown_str(comp_data.get("serial"))
                computer.location = _dropdown_str(comp_data.get("locations_id"))
                computer.status = _dropdown_str(comp_data.get("states_id"))
                computer.glpi_data = comp_data
                computer.updated_at = datetime.utcnow()

                if computer.id is None:
                    db.flush()  # garante computer.id para componentes

                computers_synced += 1
                _set_sync_state(computers_synced=computers_synced)

                # Buscar componentes
                try:
                    components = await glpi.get_all_components(glpi_id)

                    # Limpar componentes antigos
                    db.query(ComputerComponent).filter(
                        ComputerComponent.computer_id == computer.id
                    ).delete()

                    # Adicionar novos componentes
                    for comp_type, items in components.items():
                        for item in items:
                            component = ComputerComponent(
                                computer_id=computer.id,
                                component_type=comp_type.replace("Item_Device", ""),
                                name=_dropdown_str(item.get("designation")),
                                manufacturer=_dropdown_str(item.get("manufacturers_id")),
                                model=_dropdown_str(item.get("devicemodels_id")),
                                serial=_dropdown_str(item.get("serial")),
                                capacity=_dropdown_str(item.get("size")),
                                component_data=item,
                            )
                            db.add(component)
                            components_synced += 1
                            _set_sync_state(components_synced=components_synced)

                except Exception as e:
                    logger.error(f"Erro ao sincronizar componentes do computer {glpi_id}: {e}")

            db.commit()

            # Próxima página
            if len(computers_data) < limit:
                break
            start += limit

        try:
            await glpi.kill_session()
        except Exception:
            pass

        msg = f"Sincronizados {computers_synced} computadores e {components_synced} componentes"
        _set_sync_state(message=msg)
        return SyncResult(
            computers_synced=computers_synced,
            components_synced=components_synced,
            message=msg,
        )

    except Exception as e:
        try:
            await glpi.kill_session()
        except Exception:
            pass
        _set_sync_state(last_error=str(e), message="Erro na sincronização")
        raise
    finally:
        _set_sync_state(running=False, finished_at=datetime.utcnow(), current_glpi_id=None)


async def _run_sync_background():
    if _sync_lock.locked():
        return
    async with _sync_lock:
        db = SessionLocal()
        try:
            await _sync_glpi_computers_impl(db)
        except Exception as e:
            logger.error(f"Sync background falhou: {e}")
        finally:
            db.close()

@app.post("/api/sync/glpi", response_model=SyncResult)
async def sync_glpi_computers(
    async_run: bool = Query(False, alias="async"),
    db: Session = Depends(get_db),
):
    """Sincroniza computadores do GLPI com o banco de dados local.

    Use `?async=true` para iniciar em background e evitar timeouts/desconexões do cliente.
    """
    if async_run:
        if _sync_state.get("running"):
            return SyncResult(
                computers_synced=0,
                components_synced=0,
                message="Sincronização já em andamento. Consulte /api/sync/status.",
            )
        asyncio.create_task(_run_sync_background())
        return SyncResult(
            computers_synced=0,
            components_synced=0,
            message="Sincronização iniciada em background. Consulte /api/sync/status.",
        )

    try:
        return await _sync_glpi_computers_impl(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sincronização: {str(e)}")


@app.get("/api/sync/status", response_model=SyncStatus)
async def get_sync_status():
    """Status do último sync/execução em andamento."""
    return _get_sync_status()


@app.post("/api/webhook/glpi")
async def glpi_webhook(db: Session = Depends(get_db)):
    """Webhook para sincronização automática quando há mudanças no GLPI"""
    try:
        result = await sync_glpi_computers(db)
        return {"status": "success", "result": result}
    except Exception as e:
        logger.error(f"Erro no webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DEVICES ====================

def calculate_maintenance_status(last_maintenance: Optional[datetime], next_maintenance: Optional[datetime]) -> str:
    """Calcula status de manutenção"""
    if not next_maintenance:
        return "Pendente"
    
    now = datetime.utcnow()
    if now > next_maintenance:
        return "Atrasada"
    
    return "Em Dia"


@app.get("/api/devices", response_model=DevicesPage)
async def list_devices(
    tab: str = Query("all", pattern="^(all|preventiva|corretiva)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Lista dispositivos com paginação e filtros"""
    query = db.query(Computer)
    
    # Filtro de busca
    if q:
        query = query.filter(
            or_(
                Computer.name.ilike(f"%{q}%"),
                Computer.patrimonio.ilike(f"%{q}%"),
                Computer.serial.ilike(f"%{q}%"),
                Computer.entity.ilike(f"%{q}%")
            )
        )
    
    # Filtro por tipo de manutenção
    if tab == "preventiva":
        query = query.filter(Computer.last_maintenance.isnot(None))
    elif tab == "corretiva":
        query = query.filter(
            or_(
                Computer.next_maintenance.is_(None),
                Computer.next_maintenance < datetime.utcnow()
            )
        )
    
    total = query.count()
    
    # Paginação
    offset = (page - 1) * page_size
    computers = query.order_by(desc(Computer.updated_at)).offset(offset).limit(page_size).all()
    
    # Formatar resposta
    items = []
    for comp in computers:
        status = calculate_maintenance_status(comp.last_maintenance, comp.next_maintenance)
        items.append(DeviceRow(
            id=comp.id,
            glpi_id=comp.glpi_id,
            name=comp.name,
            maintenance_status=status,
            last_maintenance=comp.last_maintenance.strftime("%Y-%m-%d") if comp.last_maintenance else None,
            next_maintenance=comp.next_maintenance.strftime("%Y-%m-%d") if comp.next_maintenance else None
        ))
    
    return DevicesPage(
        items=items,
        page=page,
        page_size=page_size,
        total=total
    )


@app.get("/api/devices/{device_id}", response_model=DeviceDetail)
async def get_device_detail(device_id: int, db: Session = Depends(get_db)):
    """Busca detalhes de um dispositivo"""
    computer = db.query(Computer).filter(Computer.id == device_id).first()
    
    if not computer:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    return DeviceDetail.from_orm(computer)


# ==================== COMPONENTS ====================

@app.get("/api/devices/{device_id}/components", response_model=List[ComponentOut])
async def get_device_components(device_id: int, db: Session = Depends(get_db)):
    """Lista componentes de hardware de um dispositivo"""
    computer = db.query(Computer).filter(Computer.id == device_id).first()
    
    if not computer:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    components = db.query(ComputerComponent).filter(
        ComputerComponent.computer_id == device_id
    ).all()
    
    return components


# ==================== MAINTENANCE ====================

@app.post("/api/maintenance", response_model=MaintenanceOut)
async def create_maintenance(
    maintenance: MaintenanceCreate,
    db: Session = Depends(get_db)
):
    """Registra uma nova manutenção"""
    computer = db.query(Computer).filter(Computer.id == maintenance.computer_id).first()
    
    if not computer:
        raise HTTPException(status_code=404, detail="Computador não encontrado")
    
    # Calcular próxima manutenção
    next_due = None
    if maintenance.maintenance_type == "Preventiva" and maintenance.next_due_days:
        next_due = maintenance.performed_at + timedelta(days=maintenance.next_due_days)
    
    # Criar registro de manutenção
    maintenance_record = MaintenanceHistory(
        computer_id=maintenance.computer_id,
        maintenance_type=maintenance.maintenance_type,
        description=maintenance.description,
        performed_at=maintenance.performed_at,
        technician=maintenance.technician,
        next_due=next_due
    )
    
    db.add(maintenance_record)
    
    # Atualizar computador
    computer.last_maintenance = maintenance.performed_at
    if next_due:
        computer.next_maintenance = next_due
    
    db.commit()
    db.refresh(maintenance_record)
    
    return maintenance_record


@app.get("/api/devices/{device_id}/maintenance", response_model=List[MaintenanceOut])
async def get_device_maintenance_history(device_id: int, db: Session = Depends(get_db)):
    """Lista histórico de manutenções de um dispositivo"""
    computer = db.query(Computer).filter(Computer.id == device_id).first()
    
    if not computer:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    history = db.query(MaintenanceHistory).filter(
        MaintenanceHistory.computer_id == device_id
    ).order_by(desc(MaintenanceHistory.performed_at)).all()
    
    return history


# ==================== NOTES ====================

@app.get("/api/devices/{device_id}/notes", response_model=List[NoteOut])
async def get_device_notes(device_id: int, db: Session = Depends(get_db)):
    """Lista notas de um dispositivo"""
    computer = db.query(Computer).filter(Computer.id == device_id).first()
    
    if not computer:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    notes = db.query(ComputerNote).filter(
        ComputerNote.computer_id == device_id
    ).order_by(desc(ComputerNote.created_at)).all()
    
    return notes


@app.post("/api/devices/{device_id}/notes", response_model=NoteOut)
async def create_device_note(
    device_id: int,
    note: NoteCreate,
    db: Session = Depends(get_db)
):
    """Adiciona uma nota a um dispositivo"""
    computer = db.query(Computer).filter(Computer.id == device_id).first()
    
    if not computer:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    note_record = ComputerNote(
        computer_id=device_id,
        author=note.author,
        content=note.content
    )
    
    db.add(note_record)
    db.commit()
    db.refresh(note_record)
    
    return note_record


@app.put("/api/devices/{device_id}/notes/{note_id}", response_model=NoteOut)
async def update_device_note(
    device_id: int,
    note_id: int,
    payload: NoteUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza uma nota (somente no banco local)"""
    note = db.query(ComputerNote).filter(
        ComputerNote.id == note_id,
        ComputerNote.computer_id == device_id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    if payload.author is not None:
        note.author = payload.author
    if payload.content is not None:
        note.content = payload.content

    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return note


@app.delete("/api/devices/{device_id}/notes/{note_id}")
async def delete_device_note(device_id: int, note_id: int, db: Session = Depends(get_db)):
    """Remove uma nota (somente no banco local)"""
    note = db.query(ComputerNote).filter(
        ComputerNote.id == note_id,
        ComputerNote.computer_id == device_id
    ).first()

    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")

    db.delete(note)
    db.commit()
    return {"status": "deleted"}


@app.put("/api/maintenance/{maintenance_id}", response_model=MaintenanceOut)
async def update_maintenance(
    maintenance_id: int,
    payload: MaintenanceUpdate,
    db: Session = Depends(get_db)
):
    """Atualiza um registro de manutenção (somente no banco local)"""
    record = db.query(MaintenanceHistory).filter(MaintenanceHistory.id == maintenance_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")

    if payload.maintenance_type is not None:
        record.maintenance_type = payload.maintenance_type
    if payload.description is not None:
        record.description = payload.description
    if payload.performed_at is not None:
        record.performed_at = payload.performed_at
    if payload.technician is not None:
        record.technician = payload.technician

    # recalcular next_due se necessário
    next_due = record.next_due
    if record.maintenance_type == "Preventiva" and payload.next_due_days is not None:
        next_due = record.performed_at + timedelta(days=payload.next_due_days)
    if record.maintenance_type != "Preventiva":
        next_due = None
    record.next_due = next_due

    record.updated_at = datetime.utcnow()

    # atualizar computador relacionado
    computer = db.query(Computer).filter(Computer.id == record.computer_id).first()
    if computer:
        computer.last_maintenance = record.performed_at
        computer.next_maintenance = next_due
        computer.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/maintenance/{maintenance_id}")
async def delete_maintenance(maintenance_id: int, db: Session = Depends(get_db)):
    """Remove um registro de manutenção (somente no banco local)"""
    record = db.query(MaintenanceHistory).filter(MaintenanceHistory.id == maintenance_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")

    computer_id = record.computer_id
    db.delete(record)
    db.commit()

    # Recalcular última/próxima com base no registro mais recente
    computer = db.query(Computer).filter(Computer.id == computer_id).first()
    if computer:
        latest = db.query(MaintenanceHistory).filter(
            MaintenanceHistory.computer_id == computer_id
        ).order_by(desc(MaintenanceHistory.performed_at)).first()
        if latest:
            computer.last_maintenance = latest.performed_at
            computer.next_maintenance = latest.next_due
        else:
            computer.last_maintenance = None
            computer.next_maintenance = None
        computer.updated_at = datetime.utcnow()
        db.commit()

    return {"status": "deleted"}


# ==================== HEALTH ====================

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "GLPI Manutenções API",
        "timestamp": datetime.utcnow().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
