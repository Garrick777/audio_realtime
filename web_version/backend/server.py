"""
后端 WebSocket 服务：使用 aiohttp 提供 HTTP + WebSocket 路由。
"""
import asyncio
import json
from pathlib import Path

from aiohttp import WSMsgType, web
import websockets
from config import settings


class RealtimeServer:
    """实时 API 服务。"""

    def __init__(self):
        """初始化服务器。"""
        self.clients = {}
        self.realtime_connections = {}

        # 配置
        self.api_key = settings.api_key
        if not self.api_key:
            raise ValueError("请在.env文件中设置API_KEY")

        self.model = settings.model
        self.base_url = settings.base_url
        self.realtime_url = f"{self.base_url}?model={self.model}"
        self.frontend_dir = (Path(__file__).resolve().parent / ".." / "frontend").resolve()
        self.app = self._create_app()

    def _create_app(self):
        """创建 aiohttp 应用和路由。"""
        app = web.Application()
        app.router.add_get("/", self.handle_index)
        app.router.add_get("/css/{path:.*}", self.handle_css)
        app.router.add_get("/js/{path:.*}", self.handle_js)
        app.router.add_get("/ws", self.handle_ws)
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

        print(f"[客户端 {client_id}] 连接到 Realtime API...")

        try:
            # 使用 websockets 库连接上游 Realtime API
            realtime_ws = await websockets.connect(
                self.realtime_url,
                additional_headers=headers,
            )
            self.realtime_connections[client_id] = realtime_ws
            print(f"[客户端 {client_id}] ✅ Realtime API 连接成功")
            return realtime_ws
        except Exception as e:
            print(f"[客户端 {client_id}] ❌ Realtime API 连接失败: {e}")
            return None

    async def handle_ws(self, request):
        """WS /ws 处理客户端连接。"""
        websocket = web.WebSocketResponse()
        await websocket.prepare(request)

        client_id = id(websocket)
        self.clients[client_id] = websocket

        print(f"\n{'=' * 50}")
        print(f"[客户端 {client_id}] 新连接")
        print(f"{'=' * 50}")

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
                self.forward_client_to_realtime(websocket, realtime_ws, client_id)
            )
            realtime_to_client = asyncio.create_task(
                self.forward_realtime_to_client(websocket, realtime_ws, client_id)
            )

            done, pending = await asyncio.wait(
                {client_to_realtime, realtime_to_client},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            await asyncio.gather(*done, return_exceptions=True)

        except Exception as e:
            print(f"[客户端 {client_id}] 错误: {e}")
        finally:
            # 清理连接
            if client_id in self.clients:
                del self.clients[client_id]

            realtime_ws = self.realtime_connections.pop(client_id, None)
            if realtime_ws is not None:
                try:
                    await realtime_ws.close()
                except Exception:
                    pass

            if not websocket.closed:
                await websocket.close()

            print(f"[客户端 {client_id}] 已断开\n")

        return websocket

    async def forward_client_to_realtime(self, client_ws, realtime_ws, client_id):
        """前端 -> Realtime API。"""
        async for message in client_ws:
            try:
                if message.type == WSMsgType.TEXT:
                    data = json.loads(message.data)
                    msg_type = data.get("type", "unknown")
                    print(f"[客户端 {client_id}] -> Realtime API: {msg_type}")
                    await realtime_ws.send(message.data)
                elif message.type in (WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.ERROR):
                    break
            except json.JSONDecodeError:
                print(f"[客户端 {client_id}] 无效JSON")
            except Exception as e:
                print(f"[客户端 {client_id}] 转发错误: {e}")
                break

    async def forward_realtime_to_client(self, client_ws, realtime_ws, client_id):
        """Realtime API -> 前端。"""
        async for message in realtime_ws:
            try:
                data = json.loads(message)
                msg_type = data.get("type", "unknown")
                print(f"[客户端 {client_id}] <- Realtime API: {msg_type}")
                await client_ws.send_str(message)
            except Exception as e:
                print(f"[客户端 {client_id}] Realtime API消息错误: {e}")
                break

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
