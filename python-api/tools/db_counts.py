import os
from sqlalchemy import create_engine, text

# Defaults match python-api/config.py typical values
DB_USER = os.environ.get("DB_USER", "glpi_user")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "0000")
DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = os.environ.get("DB_PORT", "3306")
DB_NAME = os.environ.get("DB_NAME", "glpi_manutencao")

url = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
engine = create_engine(url)

with engine.connect() as c:
    computers = c.execute(text("select count(*) from computers")).scalar()
    components = c.execute(text("select count(*) from computer_components")).scalar()

print({"computers": int(computers or 0), "components": int(components or 0)})
