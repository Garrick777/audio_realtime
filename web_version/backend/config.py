"""
集中管理后端环境配置。
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# 常量定义：避免重复计算
_ENV_ALIAS = {
    "development": "dev",
    "testing": "test",
    "production": "prod",
}

# 默认值常量：避免重复创建字符串对象
_DEFAULT_MODEL = "gpt-4o-realtime-preview"
_DEFAULT_BASE_URL = "ws://vectorengine.ai/v1/realtime"
_DEFAULT_HOST = "localhost"
_DEFAULT_PORT = "8080"
_DEFAULT_LOG_LEVEL = "INFO"


def _load_env_files() -> str:
    """
    先加载仓库根目录 .env，再按 APP_ENV 加载 web_version/config/*.env。
    返回标准化后的环境名: dev/test/prod。
    """
    # 优化：只调用一次 resolve()，复用结果
    resolved_path = Path(__file__).resolve()
    repo_root = resolved_path.parents[2]
    project_root = resolved_path.parents[1]

    # 延迟导入：只在需要时导入 dotenv
    from dotenv import load_dotenv

    # 加载根目录 .env
    load_dotenv(repo_root / ".env", override=False)

    # 获取环境名称
    env_raw = os.getenv("APP_ENV", "dev").strip().lower()
    env_name = _ENV_ALIAS.get(env_raw, env_raw)

    # 加载环境特定配置
    load_dotenv(project_root / "config" / f"{env_name}.env", override=True)

    return env_name


@dataclass(frozen=True, slots=True)
class Settings:
    """运行时配置快照。使用 slots 减少内存占用。"""

    app_env: str
    api_key: str
    model: str
    base_url: str
    host: str
    port: int
    log_level: str
    gemini_api_key: str
    gemini_model: str
    gemini_base_url: str
    enable_video: bool


def _build_settings() -> Settings:
    """构建配置对象。优化：批量获取环境变量减少查询次数。"""
    app_env = _load_env_files()

    port_str = os.environ.get("PORT", _DEFAULT_PORT)
    try:
        port = int(port_str)
        if port < 1 or port > 65535:
            raise ValueError(f"端口号必须在 1-65535 范围内，当前值: {port}")
    except ValueError as e:
        raise ValueError(f"无效的 PORT 环境变量 '{port_str}': {e}") from e

    # 验证 API_KEY（生产环境必须提供）
    api_key = os.environ.get("API_KEY", "")
    if app_env == "prod" and not api_key:
        raise ValueError("生产环境必须设置 API_KEY")

    # 验证 LOG_LEVEL
    log_level = os.environ.get("LOG_LEVEL", _DEFAULT_LOG_LEVEL).upper()
    valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    if log_level not in valid_levels:
        raise ValueError(f"无效的 LOG_LEVEL '{log_level}'，必须是: {', '.join(valid_levels)}")

    return Settings(
        app_env=app_env,
        api_key=api_key,
        model=os.environ.get("MODEL", _DEFAULT_MODEL),
        base_url=os.environ.get("BASE_URL", _DEFAULT_BASE_URL),
        host=os.environ.get("HOST", _DEFAULT_HOST),
        port=port,
        log_level=log_level,
        gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite-preview"),
        gemini_base_url=os.environ.get("GEMINI_BASE_URL", "https://api.vectorengine.ai"),
        enable_video=os.environ.get("ENABLE_VIDEO", "false").lower() == "true",
    )


settings = _build_settings()
