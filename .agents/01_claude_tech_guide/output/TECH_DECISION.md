# 技术决策文档

需求ID: REQ-2026-001
决策时间: 2026-03-03 17:45:00

---

## 执行摘要

本需求旨在将现有的按钮控制式语音对话系统升级为**全自动实时语音通话系统**，实现类似电话通话的自然交互体验。核心改进包括：自动语音活动检测（VAD）、全双工通话、持续音频流处理、实时状态指示。

**技术可行性**: ✅ 高度可行
**技术风险**: 🟡 中等（主要在音频流优化和状态同步）
**推荐架构**: 事件驱动 + 状态机模式

---

## 技术栈选型

### 后端
- **语言**: Python 3.11+
- **框架**: aiohttp + websockets
- **原因**:
  - 已有代码基于此架构，保持一致性
  - aiohttp 异步性能优秀，适合 WebSocket 长连接
  - Python 对 OpenAI SDK 支持完善

### 前端
- **框架**: 原生 JavaScript (ES6+ Modules)
- **原因**:
  - 保持现有架构，避免重构开销
  - 原生 JS 性能最优，适合实时音频处理
  - 无框架开销，启动速度快

### 音频处理
- **技术**: Web Audio API + AudioWorklet
- **采样率**: 24kHz
- **格式**: 16-bit PCM
- **原因**:
  - AudioWorklet 运行在独立线程，不阻塞主线程
  - 满足 OpenAI Realtime API 要求
  - 已有 audio-worklet-processor.js 基础

### 通信协议
- **协议**: WebSocket (wss://)
- **数据格式**: JSON + Base64 编码音频
- **原因**:
  - 双向实时通信，低延迟
  - OpenAI Realtime API 基于 WebSocket
  - 已有完整的 WebSocketManager 实现

### VAD（语音活动检测）
- **方案**: OpenAI Realtime API Server VAD
- **配置**:
  - type: "server_vad"
  - threshold: 0.5 (可调)
  - silenceDurationMs: 500 (可调)
  - prefixPaddingMs: 300
- **原因**:
  - 服务端检测准确率高
  - 减轻前端计算负担
  - 已在 config.js 中配置

---

## 架构设计

### 整体架构
**模式**: 事件驱动 + 状态机模式

```
┌─────────────────────────────────────────────────────────┐
│                       前端层                              │
├──────────────────┬──────────────────┬───────────────────┤
│  UI Controller   │  State Machine   │  Event Bus        │
│  (app.js)        │  (状态管理)       │  (事件分发)        │
└────────┬─────────┴────────┬─────────┴─────────┬─────────┘
         │                  │                    │
    ┌────▼────┐      ┌─────▼─────┐      ┌──────▼──────┐
    │ Audio   │      │ WebSocket │      │   Audio     │
    │ Recorder│◄────►│  Manager  │◄────►│   Player    │
    └─────────┘      └───────────┘      └─────────────┘
         │                  │                    │
         └──────────────────┼────────────────────┘
                            │
                     WebSocket (wss://)
                            │
┌───────────────────────────▼────────────────────────────┐
│                      后端层                             │
├──────────────────┬──────────────────┬──────────────────┤
│  WebSocket       │  OpenAI Client   │  Session         │
│  Handler         │  (Realtime API)  │  Manager         │
└──────────────────┴──────────────────┴──────────────────┘
         │                  │                    │
         └──────────────────┼────────────────────┘
                            │
                   OpenAI Realtime API
                   (via vectorengine.ai)
```

### 核心模块

#### 1. **状态机模块 (CallStateMachine)**
**职责**: 管理通话状态流转
**状态定义**:
```javascript
STATES = {
  IDLE: "idle",                    // 未连接
  CONNECTING: "connecting",        // 连接中
  READY: "ready",                  // 已连接，等待说话
  USER_SPEAKING: "user_speaking",  // 用户正在说话
  PROCESSING: "processing",        // AI 处理中
  AI_SPEAKING: "ai_speaking",      // AI 正在说话
  ERROR: "error"                   // 错误状态
}
```

**状态转换规则**:
```
IDLE → CONNECTING (点击"开始通话")
CONNECTING → READY (WebSocket 连接成功)
READY → USER_SPEAKING (检测到语音活动)
USER_SPEAKING → PROCESSING (用户停止说话)
PROCESSING → AI_SPEAKING (AI 开始回复)
AI_SPEAKING → READY (AI 回复结束)
* → ERROR (任何错误)
* → IDLE (点击"结束通话")
```

#### 2. **音频录制模块 (ContinuousAudioRecorder)**
**职责**: 持续录制音频流并发送
**关键特性**:
- 持续不间断录音（去掉按钮控制）
- 使用 AudioWorklet 处理音频块
- 自动编码为 Base64
- 自动发送到 WebSocket

**数据流**:
```
麦克风 → AudioContext → AudioWorkletNode →
音频块(Int16Array) → Base64编码 → WebSocket发送
```

#### 3. **音频播放模块 (AudioPlayer)**
**职责**: 实时播放 AI 语音流
**关键特性**:
- 流式播放（边接收边播放）
- 音频缓冲管理（避免卡顿）
- 支持中断（用户打断时停止播放）
- 音量归一化

#### 4. **事件总线 (EventBus)**
**职责**: 解耦模块间通信
**关键事件**:
```javascript
// 状态事件
'state:changed'               // 状态变更
'state:user_speaking_start'   // 用户开始说话
'state:user_speaking_stop'    // 用户停止说话
'state:ai_speaking_start'     // AI 开始说话
'state:ai_speaking_stop'      // AI 停止说话

// 音频事件
'audio:chunk_received'        // 接收音频块
'audio:playback_started'      // 播放开始
'audio:playback_ended'        // 播放结束

// WebSocket 事件
'ws:connected'                // 连接成功
'ws:disconnected'             // 断开连接
'ws:error'                    // 连接错误

// VAD 事件
'vad:speech_started'          // 检测到语音开始
'vad:speech_stopped'          // 检测到语音结束
```

#### 5. **UI 控制器 (UIController)**
**职责**: 处理用户交互和视觉反馈
**功能**:
- 开始/结束通话按钮
- 实时状态显示
- 音量可视化（波形/音量条）
- 转录文本显示（可选）
- 错误提示

### 数据流

#### 用户说话流程
```
1. 用户说话 → 麦克风捕获音频
2. AudioWorklet 处理音频块
3. 编码为 Base64
4. 通过 WebSocket 发送到后端
5. 后端转发到 OpenAI Realtime API
6. OpenAI Server VAD 检测语音活动
   ├─ 检测到语音开始 → 触发 'speech_started' 事件
   └─ 检测到语音结束 → 触发 'speech_stopped' 事件
7. 前端接收事件，更新状态
8. OpenAI 生成回复
9. 音频流返回到前端
10. AudioPlayer 播放音频
```

#### 全双工打断流程
```
1. AI 正在说话（状态：AI_SPEAKING）
2. 用户开始说话（检测到语音活动）
3. 前端发送 'response.cancel' 消息
4. 停止当前 AudioPlayer 播放
5. 状态切换到 USER_SPEAKING
6. 继续监听用户音频
```

---

## 安全性要求

### 认证方案
- **API Key 管理**:
  - API Key 存储在后端环境变量
  - 前端不包含任何密钥信息
  - 后端代理所有 OpenAI API 请求

### 数据加密
- **传输加密**: WebSocket 使用 wss:// (TLS/SSL)
- **存储策略**: 音频数据不在本地存储，内存处理后即释放

### 权限管理
- **麦克风权限**:
  - 使用 `navigator.mediaDevices.getUserMedia()`
  - 用户明确授权后才能访问
  - 断开通话后释放权限

### 防护措施
- **输入验证**: 后端验证所有 WebSocket 消息格式
- **速率限制**: 限制 WebSocket 连接频率，防止滥用
- **错误处理**: 敏感错误信息不暴露给前端
- **CORS**: 后端配置正确的 CORS 策略

---

## 性能目标

### 延迟要求
- **端到端延迟**: <1s (目标 <500ms)
  - 音频采集: <50ms
  - 网络传输: <100ms
  - OpenAI 处理: <500ms
  - 音频播放: <50ms

### 音频质量
- **采样率**: 24kHz
- **位深度**: 16-bit
- **格式**: PCM
- **编码**: Base64 (传输)

### 资源占用
- **前端内存**: <100MB
- **WebSocket 缓冲**: 最大 50 音频块
- **AudioWorklet**: 独立线程，不阻塞主线程

### 并发和稳定性
- **长时间通话**: 支持 >10 分钟无卡顿
- **连接重连**: 自动重连机制（指数退避）
- **错误恢复**: 优雅降级，友好错误提示

---

## 技术风险与对策

### 1. 🔴 音频流同步问题
**风险**: 音频播放不流畅，出现断断续续或爆音
**原因**: 网络抖动、缓冲区管理不当
**对策**:
- 实现自适应缓冲区（根据网络状况动态调整）
- 使用 AudioWorklet 而非 ScriptProcessor（性能更好）
- 音频块预缓冲（minBufferChunks: 2）
- 增加抖动缓冲区（jitter buffer）

### 2. 🟡 VAD 误触发
**风险**: 环境噪音被误识别为语音，导致频繁触发
**原因**: VAD 阈值设置不当
**对策**:
- 提供可调节的 threshold 参数（默认 0.5）
- 增加 prefixPaddingMs 避免语音开头被截断
- 适当延长 silenceDurationMs，避免短暂停顿被识别为结束
- 未来可考虑前端预处理（降噪）

### 3. 🟡 全双工打断延迟
**风险**: 用户打断 AI 时，AI 仍继续说话一段时间
**原因**: 网络延迟 + 音频缓冲区中已有数据
**对策**:
- 立即清空播放队列
- 发送 `response.cancel` 消息到服务端
- 优化缓冲区大小，减少延迟
- 前端检测到用户语音活动立即停止播放

### 4. 🟢 浏览器兼容性
**风险**: AudioWorklet 不是所有浏览器都支持
**原因**: 较旧浏览器不支持 AudioWorklet API
**对策**:
- 主要支持 Chrome/Edge 最新版（已满足约束）
- 添加特性检测，不支持时显示友好提示
- 未来可提供 ScriptProcessor 降级方案（性能较差）

### 5. 🟢 麦克风权限被拒绝
**风险**: 用户拒绝麦克风权限，无法使用
**对策**:
- 清晰的权限说明提示
- 提供权限申请引导
- 被拒绝后显示如何手动开启权限的说明

---

## 依赖服务

### OpenAI Realtime API
- **用途**: 语音识别、VAD、语音合成
- **端点**: 通过 vectorengine.ai 代理
- **可用性**: 依赖外部服务，需要监控
- **降级方案**: 连接失败时显示错误，提供重试

### 浏览器 Web Audio API
- **用途**: 音频采集和播放
- **兼容性**: Chrome/Edge 最新版完全支持
- **降级方案**: 不支持时提示升级浏览器

### WebSocket 连接
- **用途**: 双向实时通信
- **稳定性**: 已实现自动重连（指数退避）
- **降级方案**: 连接失败 5 次后提示用户检查网络

---

## 开发规范

### 代码风格
- **JavaScript**: ESLint + Prettier
- **Python**: PEP 8 + Black formatter
- **命名约定**:
  - 类名：PascalCase
  - 函数/变量：camelCase (JS), snake_case (Python)
  - 常量：UPPER_SNAKE_CASE

### 文件组织
```
web_version/
├── frontend/
│   ├── js/
│   │   ├── app.js                    (主应用入口)
│   │   ├── config.js                 (配置管理)
│   │   ├── websocket.js              (WebSocket管理)
│   │   ├── audio-recorder.js         (持续录音模块 - 新增)
│   │   ├── audio-player.js           (音频播放模块 - 已有)
│   │   ├── audio-worklet-processor.js (音频处理器 - 已有)
│   │   ├── state-machine.js          (状态机 - 新增)
│   │   ├── event-bus.js              (事件总线 - 新增)
│   │   └── ui-controller.js          (UI控制器 - 新增)
│   ├── css/
│   │   ├── styles.css                (主样式)
│   │   └── audio-controls.css        (音频控件样式 - 已有)
│   └── index.html                    (主页面)
│
├── backend/
│   ├── server.py                     (WebSocket服务器)
│   ├── realtime_client.py            (OpenAI客户端)
│   └── config.py                     (后端配置)
│
└── tests/
    ├── unit/                         (单元测试)
    ├── integration/                  (集成测试)
    └── e2e/                          (端到端测试)
```

### Git 分支策略
- **主分支**: `main` (生产环境)
- **开发分支**: `develop` (开发环境)
- **功能分支**: `feature/xxx` (新功能)
- **修复分支**: `bugfix/xxx` (Bug修复)
- **命名规范**: `feature/REQ-2026-001-vad-integration`

### 版本管理
- **语义化版本**: MAJOR.MINOR.PATCH
- **当前版本**: v0.1.0 (基础版本)
- **目标版本**: v1.0.0 (全自动语音对话完成)

### 提交规范
```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型**:
- feat: 新功能
- fix: Bug修复
- refactor: 重构
- perf: 性能优化
- test: 测试
- docs: 文档
- chore: 构建/配置

**示例**:
```
feat(audio): implement continuous audio recording

- Add ContinuousAudioRecorder class
- Remove push-to-talk button control
- Auto-start recording on connection

Refs: REQ-2026-001
```

---

## 实施建议

### 开发阶段划分

#### Phase 1: 核心架构（优先级：高）
- 实现状态机模块
- 实现事件总线
- 重构音频录制为持续模式
- 集成 Server VAD 事件处理

#### Phase 2: UI 优化（优先级：高）
- 实现一键开始/结束通话
- 实时状态指示器
- 音量可视化
- 错误提示优化

#### Phase 3: 全双工打断（优先级：中）
- 实现打断检测
- 音频播放中断逻辑
- 状态同步优化

#### Phase 4: 性能优化（优先级：中）
- 音频缓冲优化
- 延迟监控和优化
- 内存占用优化

#### Phase 5: 测试和文档（优先级：高）
- 单元测试（覆盖率 >90%）
- 集成测试
- E2E 测试
- API 文档
- 用户指南

### 技术选型总结

| 类别 | 技术选择 | 状态 |
|------|---------|------|
| 前端框架 | 原生 JavaScript | ✅ 保持现有 |
| 后端框架 | Python + aiohttp | ✅ 保持现有 |
| 音频处理 | Web Audio API + AudioWorklet | ✅ 保持现有 |
| VAD 方案 | OpenAI Server VAD | ✅ 已配置 |
| 状态管理 | 状态机模式 | 🆕 新增 |
| 事件通信 | 事件总线模式 | 🆕 新增 |
| 音频录制 | 持续流式录音 | 🔄 改造现有 |
| 通信协议 | WebSocket | ✅ 保持现有 |

### 关键决策点

1. **✅ 采用服务端 VAD 而非客户端 VAD**
   - 理由：准确率更高，减轻前端负担，OpenAI 原生支持

2. **✅ 使用状态机模式管理通话状态**
   - 理由：状态转换清晰，易于维护，避免状态混乱

3. **✅ 实现事件总线解耦模块**
   - 理由：模块间松耦合，便于测试和扩展

4. **✅ 持续音频流而非按需录制**
   - 理由：实现全自动对话的基础，用户体验更自然

5. **✅ 保持原生 JavaScript 架构**
   - 理由：避免重构开销，性能最优，符合约束

---

## 性能基准测试建议

### 延迟测试
- 测量麦克风采集到音频发送的延迟
- 测量接收音频到播放的延迟
- 测量端到端对话延迟

### 音频质量测试
- 播放流畅性（无卡顿、无爆音）
- VAD 准确性（误触发率、漏检率）
- 长时间通话稳定性（>10 分钟）

### 资源占用测试
- 前端内存占用监控
- CPU 占用监控
- 网络带宽占用

---

状态: ✅ 完成
生成者: Claude高级技术指导Agent
生成时间: 2026-03-03 17:45:00

---

## 附加建议

### 立即可实施的快速优化
1. 调整 VAD 参数（silenceDurationMs）实现更快响应
2. 移除按钮控制逻辑，改为自动模式
3. 增加状态指示器，提升用户体验

### 未来扩展方向
1. 支持自定义 AI 指令（系统提示词）
2. 支持多语言切换
3. 支持本地音频录制保存（可选）
4. 支持音频质量调节（采样率切换）
5. 支持背景噪音消除

### 监控和运维
1. 添加性能监控埋点
2. 错误日志上报
3. 用户行为分析
4. API 调用统计

---

**结论**: 本需求技术可行性高，现有架构基础良好，主要工作是实现状态管理、持续音频流和 UI 优化。预计开发周期 2-3 周（含测试）。建议优先实现核心功能（Phase 1-2），再逐步优化性能和体验。
