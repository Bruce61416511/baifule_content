import json
import math
import re
from pathlib import Path

from openai import AsyncOpenAI

from config_loader import load_config as _load_config

CONFIG_DIR = Path(__file__).parent.parent / "config"

# 口播文本中不计入说话时长的标点/空白
_SPEECH_SKIP_RE = re.compile(r"[\s，。！？、；：…—·,.!?;:\"\"''()（）]+")


def _speech_duration_floor(voiceover: str) -> int:
    """按 3.3 字/秒 + 1.5 秒缓冲计算台词所需的最短时长（秒）

    wan2.7 内部合成语速实测偏慢，这个下限用代码强制兜底，
    防止 LLM 迁就脚本里给的不合理时长导致语音被截断。
    """
    text = _SPEECH_SKIP_RE.sub("", voiceover or "")
    if not text:
        return 0
    return math.ceil(len(text) / 3.3 + 1.5)


# ========== 动作价目表：加法式时长核算 ==========
# LLM 只负责识别"这一镜有哪几个动作"并按类型标注，
# 每个动作的秒数、台词语速、缓冲全部由代码按此表计算，杜绝 LLM 算术错误。
_ACTION_TABLE = {"微": 0.75, "小": 1.25, "大": 2.0, "闪": 1.0}
_ACTION_DEFAULT = 1.25  # 未标注类型的动作按小动作计


def _actions_seconds(actions) -> float:
    """按价目表累计一镜的动作总秒数；LLM 未提供/格式异常时返回 0（退化为纯台词下限）"""
    if not isinstance(actions, list):
        return 0.0
    total = 0.0
    for item in actions:
        if isinstance(item, dict):
            item = item.get("type") or item.get("action") or ""
        m = re.match(r"\s*(微|小|大|闪)", str(item))
        total += _ACTION_TABLE[m.group(1)] if m else _ACTION_DEFAULT
    return total


def _additive_duration_floor(voiceover: str, actions) -> int:
    """加法式时长下限：Σ(动作秒数) + 台词字数÷3.3 + 1.5 秒收尾缓冲，向上取整"""
    text = _SPEECH_SKIP_RE.sub("", voiceover or "")
    speech = len(text) / 3.3
    total = _actions_seconds(actions) + speech + 1.5
    return math.ceil(total) if total > 0 else 0


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


# JSON 字符串值内部未转义的 ASCII 引号修复：
# LLM 偶尔在 prompt/台词里写 说道："..."（ASCII 引号），破坏 JSON。
# 规则：前后都是中文字符/中文标点的 " 视为内容引号，转义之。
_CJK_RE = r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2014\u2026\u201c\u201d]'
_UNESCAPED_INNER_QUOTE_RE = re.compile(r'(?<=' + _CJK_RE + r')"(?=' + _CJK_RE + r')')


def _repair_json(text: str) -> str:
    return _UNESCAPED_INNER_QUOTE_RE.sub('\\"', text)


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
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 常见故障：字符串值内部有未转义的 ASCII 引号，修复后重试
        return json.loads(_repair_json(text))


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

    # 任一分镜缺 actions 清单 → 补一条强调指令整体重试一次（防止脚本锚定时长漏过代码核算）
    def _all_have_actions(lst):
        return isinstance(lst, list) and all(
            isinstance(s, dict) and isinstance(s.get("actions"), list) and s["actions"] for s in lst
        )

    if not _all_have_actions(shots):
        retry_script = (
            raw_script
            + "\n\n【重要】上一次输出中部分镜头缺少 actions 动作清单。必须严格按输出格式输出完整 JSON 数组，"
              "每个镜头对象都包含非空的 actions 数组，每项格式「类型:简述」（类型为 微/小/大/闪）。不要输出任何解释。"
        )
        result2 = await _call_llm(system_prompt, retry_script, temperature=0.3)
        shots2 = _extract_json(result2)
        if _all_have_actions(shots2):
            shots = shots2

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
        shot.setdefault("actions", [])
        if not isinstance(shot.get("actions"), list):
            shot["actions"] = []
        # 强制 duration 在 [2, 15] 范围内
        try:
            shot["duration"] = max(2, min(15, int(shot["duration"])))
        except (TypeError, ValueError):
            shot["duration"] = 5
        # 加法式核算：有动作清单时代码全权定时长（双向，防锚定下限也防锚定上限）；
        # 清单缺失时退化为单边台词下限
        if shot["actions"]:
            shot["duration"] = max(2, min(15, _additive_duration_floor(shot.get("voiceover") or "", shot["actions"])))
        else:
            floor = _speech_duration_floor(shot.get("voiceover") or "")
            if floor > shot["duration"]:
                shot["duration"] = min(15, floor)
    return shots


async def _call_llm_with_actions(system_prompt: str, user_prompt: str, temperature: float = 0.6):
    """调 LLM 并确保返回带 actions 清单的 JSON 对象；缺失时带提醒重试一次"""
    result = await _call_llm(system_prompt, user_prompt, temperature=temperature)
    data = _extract_json(result)
    if isinstance(data, dict) and isinstance(data.get("actions"), list) and data["actions"]:
        return data
    # 缺 actions 清单：补一条强调指令重试一次
    retry_prompt = (
        user_prompt
        + "\n\n【重要】上一次输出缺少 actions 动作清单。必须严格按输出格式输出完整 JSON，"
          "包含非空的 actions 数组，每项格式「类型:简述」（类型为 微/小/大/闪）。不要输出任何解释。"
    )
    result2 = await _call_llm(system_prompt, retry_prompt, temperature=0.3)
    data2 = _extract_json(result2)
    if isinstance(data2, dict) and isinstance(data2.get("actions"), list) and data2["actions"]:
        return data2
    return data  # 两次都缺失则原样返回，由调用方走退化逻辑


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
    result = await _call_llm_with_actions(system_prompt, user_input, temperature=0.6)
    data = result  # _call_llm_with_actions 已返回解析后的 dict

    if not isinstance(data, dict):
        raise ValueError("LLM 返回的不是 JSON 对象")

    new_prompt = data.get("prompt", prompt)
    new_duration = data.get("duration", duration)
    new_actions = data.get("actions")
    if not isinstance(new_actions, list):
        new_actions = []
    try:
        new_duration = max(2, min(15, int(new_duration)))
    except (TypeError, ValueError):
        new_duration = duration
    # 加法式核算：有动作清单时代码全权定时长（双向）；清单缺失时退化为单边台词下限
    if new_actions:
        new_duration = max(2, min(15, _additive_duration_floor(voiceover or "", new_actions)))
    else:
        floor = _speech_duration_floor(voiceover or "")
        if floor > new_duration:
            new_duration = min(15, floor)
    return {"prompt": new_prompt, "duration": new_duration, "actions": new_actions}
