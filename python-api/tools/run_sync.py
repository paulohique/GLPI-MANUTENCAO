import asyncio
import os
import sys

# Ensure python-api is on sys.path when running from repo root
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from database import SessionLocal
from main import _sync_glpi_computers_impl


async def _run() -> None:
    db = SessionLocal()
    try:
        result = await _sync_glpi_computers_impl(db)
        print("SYNC OK")
        print(result.model_dump())
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(_run())
