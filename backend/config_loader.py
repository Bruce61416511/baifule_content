"""统一配置加载：models.json 提供模型参数，API Key 一律从环境变量 / .env 读取。

密钥不落盘到 models.json，避免被 git 提交或经配置接口泄露。
"""
import json
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).parent
CONFIG_DIR = BACKEND_DIR / "config"


def _load_env_file(path: Path):
    """极简 .env 解析（无 python-dotenv 时的兜底）：支持 KEY=VALUE 与 # 注释，不覆盖已有环境变量。"""
    if not path.exists():
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value


try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
except ImportError:
    _load_env_file(BACKEND_DIR / ".env")


def load_config() -> dict:
    """读取 models.json 并注入环境变量中的密钥（env 优先于文件）。"""
    with open(CONFIG_DIR / "models.json", "r", encoding="utf-8") as f:
        config = json.load(f)

    dashscope_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
    if dashscope_key:
        config["api_key"] = dashscope_key

    # LLM Key 可单独配置，不配则复用 DashScope Key
    llm_key = os.environ.get("LLM_API_KEY", "").strip() or dashscope_key
    if llm_key:
        config["llm_api_key"] = llm_key

    return config
