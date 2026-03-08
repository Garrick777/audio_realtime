# Web 实时语音项目

## 目录结构

```
web_version/
├── backend/
│   ├── config.py
│   ├── server.py
│   ├── emotion_analyzer.py
│   └── gemini_client.py
├── config/
│   ├── dev.env.example
│   ├── test.env.example
│   └── prod.env.example
└── frontend/
    ├── css/
    ├── js/
    └── index.html
```

## 快速开始

### 1. 创建 Conda 虚拟环境

```bash
# 创建名为 realtime_api 的虚拟环境（Python 3.10+）
conda create -n realtime_api python=3.10 -y

# 激活虚拟环境
conda activate realtime_api
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

复制并编辑配置文件：

```bash
copy .env.example .env
```

在 `.env` 中设置必需参数：

```env
API_KEY=your-openai-api-key
GEMINI_API_KEY=your-gemini-api-key  # 可选，视频功能需要
MODEL=gpt-4o-realtime-preview
BASE_URL=ws://vectorengine.ai/v1/realtime
HOST=localhost
PORT=8080
LOG_LEVEL=INFO
ENABLE_VIDEO=false  # 是否启用视频功能
```

### 4. 启动服务器

```bash
# 确保已激活虚拟环境
conda activate realtime_api

# 启动服务器
cd web_version/backend
python server.py
```

### 5. 访问应用

- 主页: http://localhost:8080
- WebSocket: ws://localhost:8080/ws
- 健康检查: http://localhost:8080/health

## 停止服务器

按 `Ctrl+C` 停止服务器，然后退出虚拟环境：

```bash
conda deactivate
```

## 多环境配置（可选）

如需分环境配置，可创建：
- `web_version/config/dev.env`
- `web_version/config/test.env`
- `web_version/config/prod.env`

后端会优先加载根目录 `.env`，再按 `APP_ENV` 加载对应环境文件并覆盖。
