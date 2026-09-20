import json
from pathlib import Path

from openai import AsyncOpenAI

CONFIG_DIR = Path(__file__).parent.parent / "config"


def _load_config() -> dict:
    with open(CONFIG_DIR / "models.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _load_prompts() -> dict:
    with open(CONFIG_DIR / "prompts.json", "r", encoding="utf-8") as f:
        return json.load(f)


async def optimize_prompt(user_prompt: str, category: str) -> str:
    config = _load_config()
    prompts = _load_prompts()

    api_key = config.get("llm_api_key") or config.get("api_key", "")
    base_url = config.get("llm_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    model = config.get("llm_model", "qwen-plus")

    if not api_key:
        raise ValueError("请先在模型配置中设置 API Key")

    prompt_cfg = prompts.get(category, {})
    system_prompt = prompt_cfg.get("system_prompt", "请优化以下提示词，使其更适合AI生成。直接输出优化后的提示词。")

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=1000,
    )

    return response.choices[0].message.content.strip()
