import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

CONFIG_DIR = Path(__file__).parent.parent / "config"

router = APIRouter(prefix="/config")

# 密钥类字段：只在 .env / 环境变量中管理，不进 models.json、不经接口传输
SECRET_KEYS = ("api_key", "llm_api_key")


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
    data = _read_json("models.json")
    # 密钥已迁移到后端 .env，接口只返回空占位，不暴露真实值
    for k in SECRET_KEYS:
        data[k] = ""
    return data


@router.put("/models")
async def update_models(data: dict):
    try:
        # 前端回传中可能夹带密钥字段，一律丢弃，避免明文落盘
        for k in SECRET_KEYS:
            data.pop(k, None)
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
