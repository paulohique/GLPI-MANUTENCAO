from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Any, Dict

# Computer Schemas
class ComputerBase(BaseModel):
    name: str
    entity: Optional[str] = None
    patrimonio: Optional[str] = None
    serial: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None

class ComputerCreate(ComputerBase):
    glpi_id: int
    glpi_data: Optional[Dict[str, Any]] = None

class ComputerOut(BaseModel):
    id: int
    glpi_id: int
    name: str
    entity: Optional[str]
    patrimonio: Optional[str]
    serial: Optional[str]
    location: Optional[str]
    status: Optional[str]
    last_maintenance: Optional[datetime]
    next_maintenance: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Component Schemas
class ComponentBase(BaseModel):
    component_type: str
    name: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    capacity: Optional[str] = None

class ComponentOut(ComponentBase):
    id: int
    computer_id: int
    component_data: Optional[Dict[str, Any]]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Maintenance Schemas
class MaintenanceCreate(BaseModel):
    computer_id: int
    maintenance_type: str = Field(..., pattern="^(Preventiva|Corretiva)$")
    description: str
    performed_at: datetime
    technician: Optional[str] = None
    next_due_days: Optional[int] = None


class MaintenanceUpdate(BaseModel):
    maintenance_type: Optional[str] = Field(None, pattern="^(Preventiva|Corretiva)$")
    description: Optional[str] = None
    performed_at: Optional[datetime] = None
    technician: Optional[str] = None
    next_due_days: Optional[int] = None

class MaintenanceOut(BaseModel):
    id: int
    computer_id: int
    maintenance_type: str
    description: str
    performed_at: datetime
    technician: Optional[str]
    next_due: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Note Schemas
class NoteCreate(BaseModel):
    content: str
    author: str = "Sistema"


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    author: Optional[str] = None

class NoteOut(BaseModel):
    id: int
    computer_id: int
    author: str
    content: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Device List (for frontend table)
class DeviceRow(BaseModel):
    id: int
    glpi_id: int
    name: str
    maintenance_status: str
    last_maintenance: Optional[str]
    next_maintenance: Optional[str]

class DevicesPage(BaseModel):
    items: List[DeviceRow]
    page: int
    page_size: int
    total: int

# Device Detail (for frontend detail page)
class DeviceDetail(BaseModel):
    id: int
    glpi_id: int
    name: str
    serial: Optional[str]
    location: Optional[str]
    entity: Optional[str]
    patrimonio: Optional[str]
    status: Optional[str]
    last_maintenance: Optional[datetime]
    next_maintenance: Optional[datetime]
    
    class Config:
        from_attributes = True

# Sync Result
class SyncResult(BaseModel):
    computers_synced: int
    components_synced: int
    message: str


class SyncStatus(BaseModel):
    running: bool
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    computers_synced: int = 0
    components_synced: int = 0
    current_glpi_id: Optional[int] = None
    message: Optional[str] = None
    last_error: Optional[str] = None
