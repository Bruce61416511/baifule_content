from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List

from services.dashscope_client import (
    submit_t2i, submit_t2v, submit_i2v, submit_r2v, get_task_status
)
from services.uploader import save_upload
from services.tts import text_to_speech

router = APIRouter()


# ========== 请求模型 ==========

class T2IRequest(BaseModel):
    prompt: str
    size: Optional[str] = None
    n: Optional[int] = None
    style: Optional[str] = None
    seed: Optional[int] = None


class T2VRequest(BaseModel):
    prompt: str
    resolution: Optional[str] = None
    ratio: Optional[str] = None
    duration: Optional[int] = None
    prompt_extend: Optional[bool] = None
    seed: Optional[int] = None


class I2VRequest(BaseModel):
    prompt: str
    img_url: str
    last_img_url: Optional[str] = None
    resolution: Optional[str] = None
    ratio: Optional[str] = None
    duration: Optional[int] = None


class MediaItem(BaseModel):
    type: str  # reference_image, reference_video, first_frame, reference_voice
    url: str


class R2VRequest(BaseModel):
    prompt: str
    media: List[MediaItem]
    resolution: Optional[str] = None
    ratio: Optional[str] = None
    duration: Optional[int] = None


# ========== 文生图 ==========

@router.post("/t2i")
async def api_t2i(req: T2IRequest):
    try:
        task_id = await submit_t2i(req.prompt, req.model_dump(exclude={"prompt"}))
        return {"task_id": task_id, "status": "PENDING"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 文生视频 ==========

@router.post("/t2v")
async def api_t2v(req: T2VRequest):
    try:
        task_id = await submit_t2v(req.prompt, req.model_dump(exclude={"prompt"}))
        return {"task_id": task_id, "status": "PENDING"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 首尾帧生视频 ==========

@router.post("/i2v")
async def api_i2v(req: I2VRequest):
    try:
        task_id = await submit_i2v(
            req.prompt,
            req.img_url,
            req.last_img_url,
            req.model_dump(exclude={"prompt", "img_url", "last_img_url"}),
        )
        return {"task_id": task_id, "status": "PENDING"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 参考素材生视频 ==========

@router.post("/r2v")
async def api_r2v(req: R2VRequest):
    try:
        media_items = [item.model_dump() for item in req.media]
        task_id = await submit_r2v(
            req.prompt,
            media_items,
            req.model_dump(exclude={"prompt", "media"}),
        )
        return {"task_id": task_id, "status": "PENDING"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 任务状态查询 ==========

@router.get("/task/{task_id}")
async def api_task_status(task_id: str):
    try:
        result = await get_task_status(task_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 文件上传 ==========

@router.post("/upload")
async def api_upload(file: UploadFile = File(...)):
    try:
        content = await file.read()
        result = await save_upload(content, file.filename or "upload.bin")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========== 文本转语音（CosyVoice TTS）==========

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    format: Optional[str] = "mp3"


@router.post("/tts")
async def api_tts(req: TTSRequest):
    """把文本转成语音，返回音频文件 URL（用于喂给 r2v 作为 reference_voice）"""
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="台词文本不能为空")
    import traceback
    try:
        result = await text_to_speech(req.text, req.voice, req.format)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        tb = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"TTS 失败: {e}\n\n{tb}")
