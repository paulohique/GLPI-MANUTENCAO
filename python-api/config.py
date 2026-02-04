import os

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = "root"
    DB_NAME: str = "glpi_manutencao"
    
    # GLPI API
    GLPI_BASE_URL: str = "http://suporte.barbacena.mg.gov.br:8585/glpi/apirest.php"
    GLPI_APP_TOKEN: str
    GLPI_USER_TOKEN: str
    
    # App
    CORS_ORIGINS: str = "http://localhost:3000"
    MAINTENANCE_INTERVAL_DAYS: int = 365
    
    class Config:
        env_file = os.path.join(os.path.dirname(__file__), ".env")
        case_sensitive = True

settings = Settings()
