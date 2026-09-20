import json
import re
from pathlib import Path

from openai import AsyncOpenAI

from config_loader import load_config as _load_config

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _load_prompts() -> dict:
    with open(CONFIG_DIR / "prompts.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _get_llm_client():
    config = _load_config()
    api_key = config.get("llm_api_key") or config.get("api_key", "")
    base_url = config.get("llm_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    model = config.get("llm_model", "qwen-plus")
    if not api_key:
        raise ValueError("请先在模型配置中设置 API Key")
    return AsyncOpenAI(api_key=api_key, base_url=base_url), model


def _extract_json(text: str):
    """从 LLM 输出里抠出 JSON（兼容 ```json ... ``` 包裹）"""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if m:
        text = m.group(1)
    else:
        # 没包裹时，找第一个 [ 或 { 开始到最后匹配的 ] 或 }
        start_list = text.find("[")
        start_obj = text.find("{")
        candidates = [i for i in (start_list, start_obj) if i >= 0]
        if not candidates:
            raise ValueError("LLM 输出里没有 JSON")
        start = min(candidates)
        end_char = "]" if start == start_list else "}"
        end = text.rfind(end_char)
        if end < 0:
            raise ValueError("LLM 输出里 JSON 未闭合")
        text = text[start:end + 1]
    return json.loads(text)


async def _call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    client, model = _get_llm_client()
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=2000,
    )
    return response.choices[0].message.content.strip()


# ========== 原有：单段提示词润色（保留给其他模式用）==========

async def optimize_prompt(user_prompt: str, category: str) -> str:
    prompts = _load_prompts()
    prompt_cfg = prompts.get(category, {})
    system_prompt = prompt_cfg.get("system_prompt", "请优化以下提示词，使其更适合AI生成。直接输出优化后的提示词。")
    return await _call_llm(system_prompt, user_prompt)


# ========== 新增：脚本 → 分镜列表（拆分 + 估时长 + 润色）==========

async def parse_script_to_shots(raw_script: str) -> list:
    """调 LLM 把一整个 markdown 脚本拆成多个分镜，每镜含 duration + prompt + voiceover"""
    prompts = _load_prompts()
    system_prompt = prompts.get("r2v_parse", {}).get("system_prompt", "")
    if not system_prompt:
        raise ValueError("未配置 r2v_parse 提示词，请先在提示词配置里添加")

    result = await _call_llm(system_prompt, raw_script, temperature=0.5)
    shots = _extract_json(result)

    if not isinstance(shots, list):
        raise ValueError("LLM 返回的不是 JSON 数组")
    # 校验每个镜头的最小字段
    for i, shot in enumerate(shots):
        if not isinstance(shot, dict):
            raise ValueError(f"第 {i+1} 个镜头不是 JSON 对象")
        if "prompt" not in shot:
            raise ValueError(f"第 {i+1} 个镜头缺少 prompt 字段")
        shot.setdefault("duration", 5)
        shot.setdefault("voiceover", "")
        # 强制 duration 在 [2, 15] 范围内
        try:
            shot["duration"] = max(2, min(15, int(shot["duration"])))
        except (TypeError, ValueError):
            shot["duration"] = 5
    return shots


# ========== 新增：单镜头优化（重新估时长 + 润色）==========

async def optimize_shot(prompt: str, voiceover: str, duration: int) -> dict:
    """基于当前 prompt 重新估算时长 + 润色文字"""
    prompts = _load_prompts()
    system_prompt = prompts.get("r2v_optimize", {}).get("system_prompt", "")
    if not system_prompt:
        raise ValueError("未配置 r2v_optimize 提示词，请先在提示词配置里添加")

    user_input = (
        f"【当前提示词】\n{prompt}\n\n"
        f"【口播台词】\n{voiceover or '（无口播）'}\n\n"
        f"【当前时长】\n{duration} 秒"
    )
    result = await _call_llm(system_prompt, user_input, temperature=0.6)
    data = _extract_json(result)

    if not isinstance(data, dict):
        raise ValueError("LLM 返回的不是 JSON 对象")

    new_prompt = data.get("prompt", prompt)
    new_duration = data.get("duration", duration)
    try:
        new_duration = max(2, min(15, int(new_duration)))
    except (TypeError, ValueError):
        new_duration = duration
    return {"prompt": new_prompt, "duration": new_duration}
