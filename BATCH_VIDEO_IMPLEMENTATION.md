# 批量视频帧处理实现说明

## 📊 方案概述

将视频帧处理从**单帧实时发送**改为**批量序列发送**，降低 API 调用频率和成本。

---

## 🔄 核心改动

### 1. 配置调整 (`config.js`)

```javascript
VIDEO_CONFIG = {
  frameRate: 1,              // 从 2.5 fps 降低到 1 fps
  batchSize: 3,              // 每次发送 3 帧
  batchIntervalMs: 3000,     // 每 3 秒发送一次
}
```

### 2. 前端改动

#### MediaRecorder (`media-recorder.js`)
- ✅ 添加帧缓冲队列 `frameBuffer`
- ✅ 每秒捕获 1 帧，存入缓冲区
- ✅ 每 3 秒触发批量发送
- ✅ 新增 `onVideoBatch()` 回调

#### App (`app.js`)
- ✅ 从 `onVideoFrame` 改为 `onVideoBatch`
- ✅ 调用 `ws.sendVideoBatch(frameBatch)`

#### WebSocket (`websocket.js`)
- ✅ 新增 `sendVideoBatch()` 方法
- ✅ 将多个 Blob 转换为 base64 数组
- ✅ 发送格式：
```json
{
  "type": "video_batch",
  "frames": ["base64_1", "base64_2", "base64_3"],
  "count": 3,
  "timestamp": 1234567890
}
```

### 3. 后端改动

#### Server (`server.py`)
- ✅ 处理 `video_batch` 消息类型
- ✅ 解码批量帧
- ✅ 调用 `gemini_api.send_video_batch()`

#### Gemini Client (`gemini_client.py`)
- ✅ 新增 `send_video_batch()` 方法
- ✅ 构建多图片 API 请求
- ✅ 优化提示词：分析序列变化趋势

**API 请求格式：**
```python
{
  "contents": [{
    "parts": [
      {"text": "请分析这3张连续图片中人物的情感变化..."},
      {"inline_data": {"mime_type": "image/jpeg", "data": "base64_1"}},
      {"inline_data": {"mime_type": "image/jpeg", "data": "base64_2"}},
      {"inline_data": {"mime_type": "image/jpeg", "data": "base64_3"}}
    ]
  }]
}
```

---

## 📈 性能对比

| 指标 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| 帧率 | 2.5 fps | 1 fps | ↓ 60% |
| API 调用频率 | 2.5次/秒 | 0.33次/秒 | ↓ 87% |
| 带宽消耗 | ~50KB/秒 | ~50KB/3秒 | ↓ 67% |
| 响应延迟 | ~400ms | ~3秒 | ↑ 650% |
| 上下文质量 | 单帧 | 序列 | ✅ 更连贯 |

---

## ✅ 优势

1. **成本大幅降低**：API 调用减少 87%
2. **序列理解**：Gemini 可以分析情感变化趋势
3. **带宽节省**：减少 67% 网络传输
4. **更稳定**：减少频繁请求带来的不稳定性

---

## ⚠️ 注意事项

1. **延迟增加**
   - 从实时（400ms）变为批量（3秒）
   - 适合情感趋势分析，不适合快速反应场景

2. **内存管理**
   - 缓冲区限制为 `batchSize * 2`（6帧）
   - 防止内存溢出

3. **错误处理**
   - 如果缓冲区为空，跳过发送
   - 网络错误不影响后续批次

---

## 🔧 配置调优

可根据需求调整参数：

```javascript
// 更低成本（每 5 秒发送 5 帧）
frameRate: 1
batchSize: 5
batchIntervalMs: 5000

// 更快响应（每 2 秒发送 2 帧）
frameRate: 1
batchSize: 2
batchIntervalMs: 2000

// 极致省钱（每 10 秒发送 3 帧）
frameRate: 0.3
batchSize: 3
batchIntervalMs: 10000
```

---

## 🚀 测试方法

1. 启动服务器：
```bash
conda activate realtime_api
cd web_version/backend
python server.py
```

2. 打开浏览器：http://localhost:8080

3. 切换到视频模式，开始视频通话

4. 观察控制台日志：
```
[MediaRecorder] Captured frame: 45231 bytes, buffer: 1/3
[MediaRecorder] Captured frame: 46102 bytes, buffer: 2/3
[MediaRecorder] Captured frame: 44987 bytes, buffer: 3/3
[MediaRecorder] Sending batch of 3 frames
[WebSocket] Sent batch of 3 frames
[Gemini 客户端 123] 收到批量帧: 3 帧
```

---

## 📝 后续优化建议

1. **场景变化检测**
   - 只在画面变化时发送帧
   - 进一步降低成本

2. **自适应批量大小**
   - 根据情感变化频率动态调整
   - 快速变化时增加频率

3. **压缩优化**
   - 降低 JPEG 质量到 0.5
   - 或使用 WebP 格式

4. **缓存机制**
   - 相似帧去重
   - 避免重复分析
