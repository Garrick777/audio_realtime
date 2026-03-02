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
  TEXT: "text",
  VOICE: "voice",
});

export const AUDIO_CONFIG = Object.freeze({
  sampleRate: 24000,
  channels: 1,
  chunkSize: 2400,
  workletPath: "/js/audio-worklet-processor.js",
});

export const PLAYER_CONFIG = Object.freeze({
  minBufferChunks: 2,
  maxQueueSize: 50,
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
    threshold: 0.5,
    prefixPaddingMs: 300,
    silenceDurationMs: 500,
    createResponse: true,
    interruptResponse: true,
  }),
});

export const CONFIG = Object.freeze({
  WS_URL: "ws://localhost:8080/ws",
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
  REALTIME_CONFIG,
  UI_MODE,
});
