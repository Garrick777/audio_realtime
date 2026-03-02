# Web 版本使用说明

## 项目结构

```
web_version/
├── backend/
│   └── server.py       # 后端 WebSocket 服务器
└── frontend/
    └── index.html      # 前端页面
```

## 使用步骤

### 1. 安装依赖

```bash
pip install websockets
```

### 2. 启动后端服务器

```bash
cd web_version/backend
python server.py
```

应该看到：
```
============================================================
  实时语音对话 WebSocket 服务器
============================================================

服务器地址: ws://localhost:8080/ws
Realtime API: ws://vectorengine.ai/v1/realtime?model=gpt-4o-realtime-preview
模型: gpt-4o-realtime-preview (OpenAI Realtime API)

等待客户端连接...
```

### 3. 打开前端页面

在浏览器中访问：
```
http://localhost:8080
```

### 4. 开始使用

1. 点击"连接"按钮
2. 等待状态变为"Realtime API 已连接"
3. 在输入框输入消息
4. 点击"发送"或按回车

## 架构说明

```
前端浏览器 (index.html)
    ↕ WebSocket
后端服务器 (server.py)
    ↕ WebSocket
OpenAI Realtime API (通过 vectorengine.ai)
```

**说明：**
- 使用的是 OpenAI Realtime API 格式
- 模型: gpt-4o-realtime-preview
- 通过 vectorengine.ai 提供的兼容端点访问

## 注意事项

1. 确保 `.env` 文件中已配置 `API_KEY`
2. 后端服务器必须先启动
3. 前端连接地址是 ws://localhost:8080/ws
