"""
Gemini REST API 客户端（用于视频帧分析）
"""
import asyncio
import base64
import json
import logging
from typing import Callable, Optional

import aiohttp

logger = logging.getLogger(__name__)


class GeminiRealtimeAPI:
    """Gemini REST API 客户端（用于视频帧分析）"""

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-3.1-flash-lite-preview",
        base_url: str = "https://api.vectorengine.ai",
        on_response: Optional[Callable[[dict], None]] = None,
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.on_response = on_response
        self.session: Optional[aiohttp.ClientSession] = None
        self._is_connected = False

    async def connect(self) -> None:
        """初始化 HTTP 会话"""
        if self._is_connected:
            logger.warning("Already connected to Gemini API")
            return

        try:
            self.session = aiohttp.ClientSession(
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
            )
            self._is_connected = True
            logger.info("Gemini API client initialized")

        except Exception as e:
            logger.error(f"Failed to initialize Gemini API client: {e}")
            raise

    async def send_video_frame(self, frame_data: bytes, prompt: str = None) -> None:
        """发送视频帧到 Gemini API 进行分析"""
        if not self._is_connected or not self.session:
            logger.warning("Session not initialized, cannot send video frame")
            return

        try:
            # 构建请求
            base64_image = base64.b64encode(frame_data).decode("utf-8")

            # 默认提示词：专注于情感识别
            if prompt is None:
                prompt = """请分析图片中人物的情感状态：
1. 面部表情（微笑、皱眉、惊讶等）
2. 肢体语言（姿态、手势等）
3. 整体情绪（开心、悲伤、愤怒、中性、困惑等）

请用一句话简要描述情感状态。"""

            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt},
                            {
                                "inline_data": {
                                    "mime_type": "image/jpeg",
                                    "data": base64_image
                                }
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.4,  # 降低温度以获得更一致的情感判断
                    "maxOutputTokens": 100
                }
            }

            # 发送请求
            url = f"{self.base_url}/v1beta/models/{self.model}:generateContent"

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    await self._handle_response(data)
                else:
                    error_text = await response.text()
                    logger.error(f"Gemini API error {response.status}: {error_text}")

        except Exception as e:
            logger.error(f"Failed to send video frame: {e}")

    async def send_video_batch(self, frame_data_list: list[bytes], prompt: str = None) -> None:
        """发送批量视频帧到 Gemini API 进行序列分析"""
        if not self._is_connected or not self.session:
            logger.warning("Session not initialized, cannot send video batch")
            return

        try:
            # 构建多图片请求
            parts = []

            # 添加提示词
            if prompt is None:
                prompt = f"""请分析这 {len(frame_data_list)} 张连续图片中人物的情感变化：
1. 整体情感趋势（是否有明显变化）
2. 主要情感状态（开心、悲伤、愤怒、中性、困惑等）
3. 面部表情和肢体语言的变化

请用一句话总结情感状态和变化趋势。"""

            parts.append({"text": prompt})

            # 添加所有图片
            for frame_data in frame_data_list:
                base64_image = base64.b64encode(frame_data).decode("utf-8")
                parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": base64_image
                    }
                })

            payload = {
                "contents": [
                    {
                        "parts": parts
                    }
                ],
                "generationConfig": {
                    "temperature": 0.4,
                    "maxOutputTokens": 150  # 批量分析可能需要更多 token
                }
            }

            # 发送请求
            url = f"{self.base_url}/v1beta/models/{self.model}:generateContent"

            logger.info(f"Sending batch of {len(frame_data_list)} frames to Gemini API")

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    await self._handle_response(data)
                else:
                    error_text = await response.text()
                    logger.error(f"Gemini API error {response.status}: {error_text}")

        except Exception as e:
            logger.error(f"Failed to send video batch: {e}")

    async def _handle_response(self, data: dict) -> None:
        """处理 API 响应"""
        try:
            candidates = data.get("candidates", [])
            if candidates and self.on_response:
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])

                text_parts = [
                    part.get("text", "") for part in parts if "text" in part
                ]

                if text_parts:
                    response_data = {
                        "type": "visual_analysis",
                        "content": " ".join(text_parts),
                        "timestamp": asyncio.get_event_loop().time(),
                    }
                    # 如果 on_response 是协程函数，await 它
                    if asyncio.iscoroutinefunction(self.on_response):
                        await self.on_response(response_data)
                    else:
                        self.on_response(response_data)

        except Exception as e:
            logger.error(f"Error handling response: {e}")

    async def close(self) -> None:
        """关闭 HTTP 会话"""
        if self.session:
            await self.session.close()
            self._is_connected = False
            logger.info("Closed Gemini API client")

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
