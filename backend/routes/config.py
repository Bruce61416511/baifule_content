import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

CONFIG_DIR = Path(__file__).parent.parent / "config"

router = APIRouter(prefix="/config")


def _read_json(filename: str) -> dict:
    filepath = CONFIG_DIR / filename
    if not filepath.exists():
        return {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(filename: str, data: dict):
    filepath = CONFIG_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ========== 模型配置 ==========

@router.get("/models")
async def get_models():
    return _read_json("models.json")


@router.put("/models")
async def update_models(data: dict):
    try:
        _write_json("models.json", data)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 提示词配置 ==========

@router.get("/prompts")
async def get_prompts():
    return _read_json("prompts.json")


@router.put("/prompts")
async def update_prompts(data: dict):
    try:
        _write_json("prompts.json", data)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
