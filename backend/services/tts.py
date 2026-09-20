"""CosyVoice TTS 服务 - 文本转语音（预设音色）

使用 DashScope Python SDK 的 dashscope.audio.tts_v2.SpeechSynthesizer。
"""
import json
import asyncio
import uuid
from pathlib import Path

import dashscope
from dashscope.audio.tts_v2 import SpeechSynthesizer


CONFIG_DIR = Path(__file__).parent.parent / "config"


def _load_config() -> dict:
    with open(CONFIG_DIR / "models.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _tts_sync(text: str, voice: str, model: str, format: str, api_key: str,
              volume: int, rate: float, save_path: Path) -> int:
    """同步版本的 TTS，在线程池里跑，不阻塞事件循环"""
    dashscope.api_key = api_key
    synthesizer = SpeechSynthesizer(
        model=model,
        voice=voice,
        volume=volume,
        speech_rate=rate,
    )
    try:
        audio_bytes = synthesizer.call(text)
    except Exception as e:
        # 把 SDK 的原始异常透传，方便排查
        raise

    if not audio_bytes:
        # 如果 SDK 没报错但返回空，再查看 response 状态
        status_code = getattr(synthesizer, 'status_code', None)
        message = getattr(synthesizer, 'message', '') or getattr(synthesizer, 'response', '')
        raise ValueError(f"CosyVoice 返回空音频数据 (status={status_code}, msg={message})")
    save_path.write_bytes(audio_bytes)
    return len(audio_bytes)


async def text_to_speech(text: str, voice: str = None, format: str = "mp3") -> dict:
    """把文本转成音频，返回本地保存后的文件信息

    Args:
        text: 台词文本
        voice: 预设音色名称，不传则用 models.json 里的默认
        format: 输出格式（SDK 实际输出格式由 model 决定，这里只影响文件后缀）

    Returns:
        {"url": "/uploads/xxx.mp3", "path": "绝对路径", "filename": "xxx.mp3"}
    """
    cfg = _load_config()
    voice_cfg = cfg.get("voice", {})
    api_key = cfg.get("api_key") or cfg.get("llm_api_key")
    if not api_key:
        raise ValueError('未配置 API Key，请在「模型配置」页面填写 DashScope API Key')

    defaults = voice_cfg.get("defaults", {})
    voice = voice or defaults.get("voice", "longxiaochun")
    model = voice_cfg.get("model_id", "cosyvoice-v2")
    volume = int(defaults.get("volume", 50))
    rate = float(defaults.get("rate", 1.0))

    uploads_dir = Path(__file__).parent.parent / "uploads"
    uploads_dir.mkdir(exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex[:12]}.{format}"
    save_path = uploads_dir / filename

    # SDK 是同步的，放到线程池里跑，不阻塞 FastAPI 事件循环
    await asyncio.to_thread(
        _tts_sync, text, voice, model, format, api_key, volume, rate, save_path
    )

    return {
        "filename": filename,
        "path": str(save_path),
        "url": f"/uploads/{filename}",
    }
