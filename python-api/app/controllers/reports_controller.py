from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.schemas.report_schemas import MaintenanceReportResponse
from app.services.report_service import get_maintenance_report


router = APIRouter(tags=["reports"])


@router.get("/api/reports/maintenance", response_model=MaintenanceReportResponse)
async def maintenance_report(
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    maintenance_type: Optional[str] = Query(None, pattern="^(Preventiva|Corretiva)$"),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    # maintenance_type: Preventiva | Corretiva | (vazio/qualquer outro => ambas)
    return get_maintenance_report(
        db,
        from_date=from_date,
        to_date=to_date,
        maintenance_type=maintenance_type,
    )
