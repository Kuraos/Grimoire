"""Frozen-friendly entrypoint for the Grimoire backend.

Used both as the PyInstaller target (the Tauri sidecar) and as a plain way to
launch the server: `python run_server.py`. Binds to 127.0.0.1:8000.
"""
import uvicorn
from main import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
