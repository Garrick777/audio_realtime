export const STATUS = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
});

export const MESSAGE_TYPES = Object.freeze({
  SERVER_CONNECTED: "server.connected",
  REALTIME_CONNECTED: "realtime.connected",
  SESSION_CREATED: "session.created",
  RESPONSE_TEXT_DELTA: "response.text.delta",
  ERROR: "error",
  CONVERSATION_ITEM_CREATE: "conversation.item.create",
  RESPONSE_CREATE: "response.create",
});

export const UI_MODE = Object.freeze({
  VOICE: "voice",
  VIDEO: "video",
});

export const AUDIO_CONFIG = Object.freeze({
  sampleRate: 24000,
  channels: 1,
  chunkSize: 2400,
  workletPath: "/js/audio-worklet-processor.js",
});

export const PLAYER_CONFIG = Object.freeze({
  minBufferChunks: 1,  // 减少缓冲，降低延迟
  maxQueueSize: 20,    // 减少队列大小，降低内存占用
});

export const VIDEO_CONFIG = Object.freeze({
  frameRate: 1,              // 降低到每秒1帧
  width: 640,
  height: 480,
  quality: 0.7,
  enablePreview: true,
  batchSize: 3,              // 每次发送3帧
  batchIntervalMs: 3000,     // 每3秒发送一次批次
});

export const REALTIME_CONFIG = Object.freeze({
  modalities: Object.freeze(["audio", "text"]),
  voice: "alloy",
  inputAudioFormat: "pcm16",
  outputAudioFormat: "pcm16",
  inputAudioTranscription: Object.freeze({
    model: "whisper-1",
  }),
  turnDetection: Object.freeze({
    type: "server_vad",
    threshold: 0.3,           // 降低阈值，提高灵敏度
    prefixPaddingMs: 200,     // 减少前缀填充，降低延迟
    silenceDurationMs: 400,   // 减少静音检测时间，提高响应速度
    createResponse: true,
    interruptResponse: true,
  }),
});

export const CONFIG = Object.freeze({
  WS_URL: "ws://localhost:8080/ws",
  GEMINI_WS_URL: "ws://localhost:8080/ws/gemini",
  RECONNECT: Object.freeze({
    ENABLED: true,
    MAX_ATTEMPTS: 5,
    INITIAL_DELAY_MS: 1000,
    MAX_DELAY_MS: 10000,
    BACKOFF_FACTOR: 1.5,
  }),
  UI: Object.freeze({
    MESSAGE_INPUT_PLACEHOLDER: "输入消息...",
    AUTO_SCROLL: true,
    SHOW_TIMESTAMPS: true,
  }),
  AUDIO_CONFIG,
  PLAYER_CONFIG,
  VIDEO_CONFIG,
  REALTIME_CONFIG,
  UI_MODE,
});
