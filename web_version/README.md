# Web 实时语音项目环境说明

## 目录结构

```
web_version/
├── backend/
│   ├── config.py
│   └── server.py
├── config/
│   ├── dev.env.example
│   ├── test.env.example
│   └── prod.env.example
├── frontend/
│   ├── css/
│   ├── js/
│   └── index.html
├── scripts/
│   ├── setup.ps1
│   ├── run-dev.ps1
│   └── verify-env.ps1
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## 环境准备

1. 复制环境变量模板：

```bash
copy .env.example .env
```

2. 在 `.env` 中设置 `API_KEY`，其余参数可按需覆盖：

```env
API_KEY=your-api-key
APP_ENV=dev
HOST=localhost
PORT=8080
MODEL=gpt-4o-realtime-preview
BASE_URL=ws://vectorengine.ai/v1/realtime
LOG_LEVEL=INFO
```

3. 如需分环境配置，可基于以下模板创建对应文件：
- `web_version/config/dev.env`
- `web_version/config/test.env`
- `web_version/config/prod.env`

后端会优先加载根目录 `.env`，再按 `APP_ENV` 加载对应环境文件并覆盖。

## 安装依赖

在仓库根目录执行：

```bash
pip install -r requirements.txt
```

Windows PowerShell 可直接运行：

```powershell
.\web_version\scripts\setup.ps1
```

## 启动开发环境

```powershell
.\web_version\scripts\run-dev.ps1
```

启动后访问：
- HTTP: `http://localhost:8080`
- WS: `ws://localhost:8080/ws`
- 健康检查: `http://localhost:8080/health`

## 环境验证

```powershell
.\web_version\scripts\verify-env.ps1
```

该脚本会检查依赖导入并编译后端源码。
