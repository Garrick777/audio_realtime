"""
后端 WebSocket 服务：使用 aiohttp 提供 HTTP + WebSocket 路由。
"""
import asyncio
import json
import logging
import traceback
from pathlib import Path

from aiohttp import WSMsgType, web
import websockets
from config import settings
from gemini_client import GeminiRealtimeAPI
from emotion_analyzer import EmotionAnalyzer, EmotionAwarePromptBuilder

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


class RealtimeServer:
    """实时 API 服务。"""

    def __init__(self):
        """初始化服务器。"""
        self.clients = {}
        self.realtime_connections = {}
        self.gemini_connections = {}
        self.emotion_analyzers = {}  # 每个客户端一个情感分析器

        # 配置
        self.api_key = settings.api_key
        if not self.api_key:
            raise ValueError("请在.env文件中设置API_KEY")

        self.model = settings.model
        self.base_url = settings.base_url
        self.realtime_url = f"{self.base_url}?model={self.model}"
        self.frontend_dir = (Path(__file__).resolve().parent / ".." / "frontend").resolve()

        # Gemini 配置
        self.gemini_api_key = settings.gemini_api_key
        self.gemini_model = settings.gemini_model
        self.gemini_base_url = settings.gemini_base_url
        self.enable_video = settings.enable_video

        self.app = self._create_app()

    def _create_app(self):
        """创建 aiohttp 应用和路由。"""
        app = web.Application()
        app.router.add_get("/", self.handle_index)
        app.router.add_get("/css/{path:.*}", self.handle_css)
        app.router.add_get("/js/{path:.*}", self.handle_js)
        app.router.add_get("/ws", self.handle_ws)
        app.router.add_get("/ws/gemini", self.handle_gemini_ws)
        app.router.add_get("/health", self.handle_health)
        return app

    async def _serve_static_file(self, base_dir, relative_path):
        """从指定目录安全地返回静态文件。"""
        base_path = Path(base_dir).resolve()
        file_path = (base_path / relative_path).resolve()

        if base_path not in file_path.parents and file_path != base_path:
            raise web.HTTPForbidden(text="forbidden")
        if not file_path.exists() or not file_path.is_file():
            raise web.HTTPNotFound(text="not found")

        return web.FileResponse(file_path)

    async def handle_index(self, _request):
        """GET / 返回首页。"""
        return web.FileResponse(self.frontend_dir / "index.html")

    async def handle_css(self, request):
        """GET /css/* 返回 CSS 静态文件。"""
        path = request.match_info.get("path", "")
        return await self._serve_static_file(self.frontend_dir / "css", path)

    async def handle_js(self, request):
        """GET /js/* 返回 JS 静态文件。"""
        path = request.match_info.get("path", "")
        return await self._serve_static_file(self.frontend_dir / "js", path)

    async def handle_health(self, _request):
        """GET /health 健康检查。"""
        return web.json_response(
            {
                "status": "ok",
                "clients": len(self.clients),
            }
        )

    async def connect_to_realtime_api(self, client_id):
        """连接到 Realtime API。"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        logger.info(f"[客户端 {client_id}] 连接到 Realtime API...")

        try:
            # 使用 websockets 库连接上游 Realtime API，添加超时
            realtime_ws = await asyncio.wait_for(
                websockets.connect(
                    self.realtime_url,
                    additional_headers=headers,
                    ping_interval=20,  # 每 20 秒发送 ping
                    ping_timeout=10,   # ping 超时 10 秒
                    close_timeout=10,  # 关闭超时 10 秒
                ),
                timeout=30.0  # 连接超时 30 秒
            )

            self.realtime_connections[client_id] = realtime_ws
            logger.info(f"[客户端 {client_id}] Realtime API 连接成功")
            return realtime_ws
        except asyncio.TimeoutError:
            logger.error(f"[客户端 {client_id}] Realtime API 连接超时")
            return None
        except Exception as e:
            logger.error(f"[客户端 {client_id}] Realtime API 连接失败: {e}")
            logger.debug(traceback.format_exc())
            return None

    async def handle_ws(self, request):
        """WS /ws 处理客户端连接。"""
        websocket = web.WebSocketResponse()
        await websocket.prepare(request)

        client_id = id(websocket)
        self.clients[client_id] = websocket
        logger.info(f"[客户端 {client_id}] 新连接")

        realtime_ws = None
        try:
            # 发送连接确认
            await websocket.send_json(
                {
                    "type": "server.connected",
                    "message": "已连接到服务器，正在连接 Realtime API...",
                }
            )

            # 连接到 Realtime API
            realtime_ws = await self.connect_to_realtime_api(client_id)
            if not realtime_ws:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "无法连接到 Realtime API",
                    }
                )
                await websocket.close()
                return websocket

            # 通知前端 Realtime API 连接成功
            await websocket.send_json(
                {
                    "type": "realtime.connected",
                    "message": "Realtime API 连接成功",
                }
            )

            # 创建双向转发任务
            client_to_realtime = asyncio.create_task(
                self.forward_client_to_realtime(websocket, realtime_ws, client_id),
                name=f"client_to_realtime_{client_id}"
            )
            realtime_to_client = asyncio.create_task(
                self.forward_realtime_to_client(websocket, realtime_ws, client_id),
                name=f"realtime_to_client_{client_id}"
            )

            # 等待任一任务完成或失败
            done, pending = await asyncio.wait(
                {client_to_realtime, realtime_to_client},
                return_when=asyncio.FIRST_COMPLETED,
            )

            # 取消未完成的任务
            for task in pending:
                task.cancel()

            # 等待所有任务完成
            await asyncio.gather(*done, *pending, return_exceptions=True)

        except asyncio.CancelledError:
            logger.info(f"[客户端 {client_id}] 连接被取消")
            raise
        except Exception as e:
            logger.error(f"[客户端 {client_id}] 未处理异常: {e}")
            logger.debug(traceback.format_exc())
        finally:
            # 清理连接
            self.clients.pop(client_id, None)
            realtime_ws = self.realtime_connections.pop(client_id, None)

            if realtime_ws:
                await realtime_ws.close()

            if not websocket.closed:
                await websocket.close()

            logger.info(f"[客户端 {client_id}] 已断开")

        return websocket

    async def handle_gemini_ws(self, request):
        """WS /ws/gemini 处理 Gemini 视频流连接。"""
        if not self.enable_video or not self.gemini_api_key:
            return web.Response(status=503, text="Video feature not enabled")

        websocket = web.WebSocketResponse()
        await websocket.prepare(request)

        client_id = id(websocket)
        logger.info(f"[Gemini 客户端 {client_id}] 新连接")

        # 创建情感分析器
        emotion_analyzer = EmotionAnalyzer()
        self.emotion_analyzers[client_id] = emotion_analyzer

        gemini_api = None
        try:
            # 创建响应回调
            async def on_response(response_data):
                if not websocket.closed:
                    # 分析视觉情感
                    visual_content = response_data.get("content", "")
                    visual_emotion = emotion_analyzer.analyze_visual_emotion(visual_content)

                    # 添加情感信息到响应
                    response_data["emotion"] = {
                        "type": visual_emotion.emotion.value,
                        "confidence": visual_emotion.confidence,
                        "source": "visual"
                    }

                    await websocket.send_json(response_data)

            # 连接到 Gemini API
            gemini_api = GeminiRealtimeAPI(
                api_key=self.gemini_api_key,
                model=self.gemini_model,
                base_url=self.gemini_base_url,
                on_response=on_response,
            )
            await gemini_api.connect()
            self.gemini_connections[client_id] = gemini_api

            # 发送连接确认
            await websocket.send_json({
                "type": "gemini.connected",
                "message": "Gemini API 连接成功",
            })

            # 接收视频帧并转发到 Gemini
            async for message in websocket:
                try:
                    if message.type == WSMsgType.TEXT:
                        data = json.loads(message.data)

                        if data.get("type") == "video_frame":
                            import base64
                            frame_data = base64.b64decode(data["frame"])
                            await gemini_api.send_video_frame(frame_data)

                        elif data.get("type") == "video_batch":
                            # 处理批量视频帧
                            import base64
                            frames = data.get("frames", [])
                            frame_count = data.get("count", len(frames))
                            logger.info(f"[Gemini 客户端 {client_id}] 收到批量帧: {frame_count} 帧")

                            # 解码所有帧
                            frame_data_list = [base64.b64decode(frame) for frame in frames]

                            # 发送批量帧到 Gemini
                            await gemini_api.send_video_batch(frame_data_list)

                    elif message.type in (WSMsgType.CLOSE, WSMsgType.CLOSED):
                        logger.info(f"[Gemini 客户端 {client_id}] 客户端关闭连接")
                        break
                    elif message.type == WSMsgType.ERROR:
                        logger.error(f"[Gemini 客户端 {client_id}] WebSocket 错误")
                        break

                except json.JSONDecodeError as e:
                    logger.warning(f"[Gemini 客户端 {client_id}] 无效 JSON: {e}")
                except Exception as e:
                    logger.error(f"[Gemini 客户端 {client_id}] 处理错误: {e}")
                    logger.debug(traceback.format_exc())

        except Exception as e:
            logger.error(f"[Gemini 客户端 {client_id}] 未处理异常: {e}")
            logger.debug(traceback.format_exc())
        finally:
            # 清理连接
            self.gemini_connections.pop(client_id, None)
            self.emotion_analyzers.pop(client_id, None)

            if gemini_api:
                await gemini_api.close()

            if not websocket.closed:
                await websocket.close()

            logger.info(f"[Gemini 客户端 {client_id}] 已断开")

        return websocket

    async def forward_client_to_realtime(self, client_ws, realtime_ws, client_id):
        """前端 -> Realtime API。"""
        try:
            async for message in client_ws:
                try:
                    if message.type == WSMsgType.TEXT:
                        data = json.loads(message.data)
                        msg_type = data.get("type", "unknown")
                        logger.debug(f"[客户端 {client_id}] -> Realtime API: {msg_type}")
                        await realtime_ws.send(message.data)
                    elif message.type in (WSMsgType.CLOSE, WSMsgType.CLOSED):
                        logger.info(f"[客户端 {client_id}] 客户端关闭连接")
                        break
                    elif message.type == WSMsgType.ERROR:
                        logger.error(f"[客户端 {client_id}] WebSocket 错误")
                        break
                except json.JSONDecodeError as e:
                    logger.warning(f"[客户端 {client_id}] 无效 JSON: {e}")
                    await client_ws.send_json({
                        "type": "error",
                        "message": "无效的 JSON 格式"
                    })
                except websockets.exceptions.ConnectionClosed:
                    logger.info(f"[客户端 {client_id}] Realtime API 连接已关闭")
                    break
                except Exception as e:
                    logger.error(f"[客户端 {client_id}] 转发错误: {e}")
                    logger.debug(traceback.format_exc())
                    break
        except asyncio.CancelledError:
            logger.debug(f"[客户端 {client_id}] 客户端->Realtime 转发任务被取消")
            raise

    async def forward_realtime_to_client(self, client_ws, realtime_ws, client_id):
        """Realtime API -> 前端。"""
        try:
            async for message in realtime_ws:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type", "unknown")
                    logger.debug(f"[客户端 {client_id}] <- Realtime API: {msg_type}")

                    if client_ws.closed:
                        logger.warning(f"[客户端 {client_id}] 客户端已关闭，停止转发")
                        break

                    await client_ws.send_str(message)
                except json.JSONDecodeError as e:
                    logger.warning(f"[客户端 {client_id}] Realtime API 返回无效 JSON: {e}")
                except websockets.exceptions.ConnectionClosed:
                    logger.info(f"[客户端 {client_id}] Realtime API 连接已关闭")
                    break
                except Exception as e:
                    logger.error(f"[客户端 {client_id}] Realtime API 消息错误: {e}")
                    logger.debug(traceback.format_exc())
                    break
        except asyncio.CancelledError:
            logger.debug(f"[客户端 {client_id}] Realtime->客户端 转发任务被取消")
            raise

    async def start(self, host="localhost", port=8080):
        """启动 HTTP + WebSocket 服务器。"""
        print("\n" + "=" * 60)
        print("  实时语音对话 HTTP/WebSocket 服务器")
        print("=" * 60)
        print(f"\nHTTP 地址: http://{host}:{port}")
        print(f"WebSocket 地址: ws://{host}:{port}/ws")
        print(f"Realtime API: {self.realtime_url}")
        print(f"模型: {self.model} (OpenAI Realtime API)")
        print("\n等待客户端连接...\n")

        runner = web.AppRunner(self.app)
        await runner.setup()

        site = web.TCPSite(runner, host=host, port=port)
        await site.start()

        try:
            await asyncio.Future()  # 永久运行
        finally:
            await runner.cleanup()


def main():
    """主函数。"""
    try:
        server = RealtimeServer()
        asyncio.run(server.start(host=settings.host, port=settings.port))
    except ValueError as e:
        print(f"\n❌ 配置错误: {e}")
    except KeyboardInterrupt:
        print("\n\n服务器关闭")


if __name__ == "__main__":
    main()
