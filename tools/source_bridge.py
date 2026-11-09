"""Serve existing Fifones tools locally without starting scheduled jobs or microphone.
This adapter never edits original application code. User actions through its API
retain the original permissions and persistence. Used only when port 8765 is free.
"""
from pathlib import Path
import sqlite3
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / 'Desktop' / 'Fifones'

def main():
    if not (SOURCE / 'backend/app/main.py').is_file():
        raise SystemExit('Instalação Fifones não encontrada. Abra o Fifones original para conectar suas ferramentas.')
    source_db = SOURCE / 'data/fifones.db'
    if source_db.is_file():
        folder = ROOT / 'data/backups'
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / ('fifones-before-city-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S') + '.sqlite3')
        with sqlite3.connect(source_db.as_uri() + '?mode=ro', uri=True) as original, sqlite3.connect(target) as backup:
            original.backup(backup)
    sys.path.insert(0, str(SOURCE / 'backend'))
    from app.main import create_app
    import uvicorn
    # No lifespan: this bridge opens no microphone and runs no automatic maintenance,
    # reminders, model recovery or scheduled agents. Manual browser voice still works.
    uvicorn.run(create_app(), host='127.0.0.1', port=8765, lifespan='off', log_level='warning', access_log=False)

if __name__ == '__main__':
    main()
