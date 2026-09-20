import os
import uuid
import aiofiles
from pathlib import Path

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


async def save_upload(file_content: bytes, filename: str) -> dict:
    ext = Path(filename).suffix or ".bin"
    save_name = f"{uuid.uuid4().hex[:12]}{ext}"
    save_path = UPLOAD_DIR / save_name

    async with aiofiles.open(save_path, "wb") as f:
        await f.write(file_content)

    return {
        "filename": save_name,
        "path": str(save_path),
        "url": f"/uploads/{save_name}",
    }
