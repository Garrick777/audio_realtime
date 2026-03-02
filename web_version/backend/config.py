"""
集中管理后端环境配置。
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _load_env_files() -> str:
    """
    先加载仓库根目录 .env，再按 APP_ENV 加载 web_version/config/*.env。
    返回标准化后的环境名: dev/test/prod。
    """
    repo_root = Path(__file__).resolve().parents[2]
    project_root = Path(__file__).resolve().parents[1]

    load_dotenv(repo_root / ".env", override=False)

    env_raw = os.getenv("APP_ENV", "dev").strip().lower()
    env_alias = {
        "development": "dev",
        "testing": "test",
        "production": "prod",
    }
    env_name = env_alias.get(env_raw, env_raw)

    env_file = project_root / "config" / f"{env_name}.env"
    if env_file.exists():
        load_dotenv(env_file, override=True)

    return env_name


@dataclass(frozen=True)
class Settings:
    """运行时配置快照。"""

    app_env: str
    api_key: str
    model: str
    base_url: str
    host: str
    port: int
    log_level: str


def _build_settings() -> Settings:
    app_env = _load_env_files()
    return Settings(
        app_env=app_env,
        api_key=os.getenv("API_KEY", ""),
        model=os.getenv("MODEL", "gpt-4o-realtime-preview"),
        base_url=os.getenv("BASE_URL", "ws://vectorengine.ai/v1/realtime"),
        host=os.getenv("HOST", "localhost"),
        port=int(os.getenv("PORT", "8080")),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )


settings = _build_settings()
