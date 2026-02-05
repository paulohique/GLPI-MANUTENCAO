from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.integrations.glpi_client import GlpiClient
from app.models import Computer, ComputerComponent
from app.schemas.schemas import SyncResult, SyncStatus


logger = logging.getLogger(__name__)


_sync_lock = asyncio.Lock()
_sync_state: Dict[str, Any] = {
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
    if value is None:
        return ""
    if isinstance(value, dict):
        for key in ("completename", "name", "label"):
            v = value.get(key)
            if v:
                return str(v)
        if "id" in value and value.get("id") is not None:
            return str(value.get("id"))
        return ""
    return str(value)


def _component_name(item_type: str, item: Dict[str, Any]) -> str:
    direct = item.get("designation") or item.get("name")
    if direct:
        return _dropdown_str(direct)

    type_key_map = {
        "Item_DeviceProcessor": "deviceprocessors_id",
        "Item_DeviceMemory": "devicememories_id",
        "Item_DeviceHardDrive": "deviceharddrives_id",
        "Item_DeviceNetworkCard": "devicenetworkcards_id",
        "Item_DeviceGraphicCard": "devicegraphiccards_id",
        "Item_DeviceMotherboard": "devicemotherboards_id",
        "Item_DevicePowerSupply": "devicepowersupplies_id",
    }
    fallback_key = type_key_map.get(item_type)
    if fallback_key:
        return _dropdown_str(item.get(fallback_key))

    return ""


def _set_sync_state(**kwargs):
    _sync_state.update(kwargs)


def get_sync_status() -> SyncStatus:
    return SyncStatus(**_sync_state)


async def sync_glpi_computers_impl(db: Session) -> SyncResult:
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

                computer = db.query(Computer).filter(Computer.glpi_id == glpi_id).first()
                if not computer:
                    computer = Computer(glpi_id=glpi_id)
                    db.add(computer)

                computer.name = (comp_data.get("name") or f"Computer-{glpi_id}")
                computer.entity = _dropdown_str(comp_data.get("entities_id"))
                computer.patrimonio = _dropdown_str(comp_data.get("otherserial"))
                computer.serial = _dropdown_str(comp_data.get("serial"))
                computer.location = _dropdown_str(comp_data.get("locations_id"))
                computer.status = _dropdown_str(comp_data.get("states_id"))
                computer.glpi_data = comp_data
                computer.updated_at = datetime.utcnow()

                if computer.id is None:
                    db.flush()

                computers_synced += 1
                _set_sync_state(computers_synced=computers_synced)

                try:
                    components = await glpi.get_all_components(glpi_id)

                    db.query(ComputerComponent).filter(
                        ComputerComponent.computer_id == computer.id
                    ).delete()

                    for comp_type, items in components.items():
                        for item in items:
                            component = ComputerComponent(
                                computer_id=computer.id,
                                component_type=comp_type.replace("Item_Device", ""),
                                name=_component_name(comp_type, item),
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


async def _run_sync_background() -> None:
    if _sync_lock.locked():
        return
    async with _sync_lock:
        db = SessionLocal()
        try:
            await sync_glpi_computers_impl(db)
        except Exception as e:
            logger.error(f"Sync background falhou: {e}")
        finally:
            db.close()


def start_sync_background() -> None:
    asyncio.create_task(_run_sync_background())


def is_sync_running() -> bool:
    return bool(_sync_state.get("running"))
