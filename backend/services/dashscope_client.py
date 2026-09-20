import os
import time
import asyncio
from typing import Optional

import httpx

from config_loader import load_config as _load_config

# 内存中存储任务状态
_tasks: dict = {}


async def _submit_task(endpoint: str, payload: dict) -> str:
    config = _load_config()
    api_key = config.get("api_key", "")
    if not api_key:
        raise ValueError("请先在模型配置中设置 DashScope API Key")

    url = f"https://dashscope.aliyuncs.com/api/v1/services/aigc/{endpoint}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    task_id = data.get("output", {}).get("task_id", "")
    if not task_id:
        raise ValueError(f"提交任务失败: {data}")
    return task_id


async def _poll_task(task_id: str) -> dict:
    config = _load_config()
    api_key = config.get("api_key", "")

    url = f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    output = data.get("output", {})
    status = output.get("task_status", "UNKNOWN")
    return {
        "task_id": task_id,
        "status": status,
        "output": output,
        "usage": data.get("usage", {}),
    }


# ========== 文生图 ==========

async def submit_t2i(prompt: str, params: dict) -> str:
    config = _load_config()
    model_cfg = config["models"]["t2i"]
    model_id = model_cfg.get("model_id", "wanx2.6-t2i")
    defaults = model_cfg.get("defaults", {})

    payload = {
        "model": model_id,
        "input": {
            "prompt": prompt,
        },
        "parameters": {
            "size": params.get("size", defaults.get("size", "1024*1024")),
            "n": params.get("n", defaults.get("n", 4)),
        },
    }
    style = params.get("style", defaults.get("style", ""))
    if style:
        payload["parameters"]["style"] = style

    seed = params.get("seed")
    if seed is not None:
        payload["parameters"]["seed"] = seed

    return await _submit_task("text2image/image-synthesis", payload)


# ========== 文生视频 ==========

async def submit_t2v(prompt: str, params: dict) -> str:
    config = _load_config()
    model_cfg = config["models"]["t2v"]
    model_id = model_cfg.get("model_id", "wan2.7-t2v")
    defaults = model_cfg.get("defaults", {})

    payload = {
        "model": model_id,
        "input": {
            "prompt": prompt,
        },
        "parameters": {
            "resolution": params.get("resolution", defaults.get("resolution", "720P")),
            "ratio": params.get("ratio", defaults.get("ratio", "16:9")),
            "duration": params.get("duration", defaults.get("duration", 5)),
        },
    }
    if params.get("prompt_extend", defaults.get("prompt_extend", True)):
        payload["parameters"]["prompt_extend"] = True

    seed = params.get("seed")
    if seed is not None:
        payload["parameters"]["seed"] = seed

    return await _submit_task("video-generation/video-synthesis", payload)


# ========== 首尾帧生视频 ==========

async def submit_i2v(prompt: str, img_url: str, last_img_url: Optional[str], params: dict) -> str:
    config = _load_config()
    model_cfg = config["models"]["i2v"]
    model_id = model_cfg.get("model_id", "wan2.7-i2v")
    defaults = model_cfg.get("defaults", {})

    media = [{"type": "first_frame", "url": img_url}]
    if last_img_url:
        media.append({"type": "last_frame", "url": last_img_url})

    payload = {
        "model": model_id,
        "input": {
            "prompt": prompt,
            "media": media,
        },
        "parameters": {
            "resolution": params.get("resolution", defaults.get("resolution", "720P")),
            "ratio": params.get("ratio", defaults.get("ratio", "16:9")),
            "duration": params.get("duration", defaults.get("duration", 5)),
        },
    }

    return await _submit_task("video-generation/video-synthesis", payload)


# ========== 参考素材生视频 ==========

async def submit_r2v(prompt: str, media_items: list, params: dict) -> str:
    config = _load_config()
    model_cfg = config["models"]["r2v"]
    model_id = model_cfg.get("model_id", "wan2.7-r2v")
    defaults = model_cfg.get("defaults", {})

    payload = {
        "model": model_id,
        "input": {
            "prompt": prompt,
            "media": media_items,
        },
        "parameters": {
            "resolution": params.get("resolution", defaults.get("resolution", "720P")),
            "ratio": params.get("ratio", defaults.get("ratio", "16:9")),
            "duration": params.get("duration", defaults.get("duration", 5)),
        },
    }

    return await _submit_task("video-generation/video-synthesis", payload)


# ========== 任务状态查询 ==========

async def get_task_status(task_id: str) -> dict:
    result = await _poll_task(task_id)
    # 缓存到内存
    _tasks[task_id] = result
    return result


def get_cached_task(task_id: str) -> Optional[dict]:
    return _tasks.get(task_id)
