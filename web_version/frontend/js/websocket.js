import { CONFIG, MESSAGE_TYPES, REALTIME_CONFIG, STATUS } from "./config.js";

const OPEN_STATE = 1;
const DEFAULT_INSTRUCTIONS =
  "You are a helpful AI assistant. Please respond in the same language as the user.";

function int16ArrayToBase64(int16Array) {
  const uint8Array = new Uint8Array(
    int16Array.buffer,
    int16Array.byteOffset,
    int16Array.byteLength
  );
  let binary = "";
  for (let i = 0; i < uint8Array.length; i += 1) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

function base64ToInt16Array(base64) {
  const binary = atob(base64);
  const alignedLength = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(alignedLength);
  for (let i = 0; i < alignedLength; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export class WebSocketManager {
  constructor(config = CONFIG) {
    this.config = config;
    this.ws = null;
    this.geminiWs = null;
    this.status = STATUS.DISCONNECTED;

    this._manualClose = false;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;

    this._messageCallbacks = new Set();
    this._statusCallbacks = new Set();
    this._audioDeltaCallbacks = new Set();
    this._audioTranscriptCallbacks = new Set();
    this._speechStartCallbacks = new Set();
    this._speechStopCallbacks = new Set();
    this._visualAnalysisCallbacks = new Set();
  }

  connect() {
    if (this.status === STATUS.CONNECTED || this.status === STATUS.CONNECTING) {
      return;
    }

    this._manualClose = false;
    this._clearReconnectTimer();
    this._setStatus(STATUS.CONNECTING);

    this.ws = new WebSocket(this.config.WS_URL);
    this.ws.onopen = () => this._handleOpen();
    this.ws.onmessage = (event) => this._handleMessage(event);
    this.ws.onerror = (event) => this._handleError(event);
    this.ws.onclose = (event) => this._handleClose(event);
  }

  disconnect() {
    this._manualClose = true;
    this._clearReconnectTimer();

    if (this.geminiWs && this.geminiWs.readyState === OPEN_STATE) {
      this.geminiWs.close();
      this.geminiWs = null;
    }

    if (!this.ws) {
      this._setStatus(STATUS.DISCONNECTED);
      return;
    }

    if (this.ws.readyState === OPEN_STATE) {
      this.ws.close();
    } else {
      this.ws = null;
      this._setStatus(STATUS.DISCONNECTED);
    }
  }

  reconnect() {
    if (!this.config.RECONNECT.ENABLED || this._manualClose) {
      return;
    }

    if (this._reconnectAttempts >= this.config.RECONNECT.MAX_ATTEMPTS) {
      this._setStatus(STATUS.ERROR);
      return;
    }

    const delay = Math.min(
      this.config.RECONNECT.INITIAL_DELAY_MS *
        this.config.RECONNECT.BACKOFF_FACTOR ** this._reconnectAttempts,
      this.config.RECONNECT.MAX_DELAY_MS
    );

    this._reconnectAttempts += 1;
    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  sendMessage(message) {
    if (!this.ws || this.ws.readyState !== OPEN_STATE) {
      return false;
    }

    const payload = typeof message === "string" ? message : JSON.stringify(message);
    this.ws.send(payload);
    return true;
  }

  sendUserText(text) {
    if (!text?.trim()) {
      return false;
    }

    const conversationMessage = {
      type: MESSAGE_TYPES.CONVERSATION_ITEM_CREATE,
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: text.trim(),
          },
        ],
      },
    };

    const responseRequest = {
      type: MESSAGE_TYPES.RESPONSE_CREATE,
      response: {
        modalities: ["text"],
        instructions: DEFAULT_INSTRUCTIONS,
      },
    };

    const sentConversation = this.sendMessage(conversationMessage);
    const sentResponse = this.sendMessage(responseRequest);
    return sentConversation && sentResponse;
  }

  sendAudioChunk(int16Array) {
    if (!(int16Array instanceof Int16Array) || int16Array.length === 0) {
      return false;
    }

    const audio = int16ArrayToBase64(int16Array);
    return this.sendMessage({
      type: "input_audio_buffer.append",
      audio,
    });
  }

  commitAudioInput() {
    return this.sendMessage({
      type: "input_audio_buffer.commit",
    });
  }

  clearAudioInput() {
    return this.sendMessage({
      type: "input_audio_buffer.clear",
    });
  }

  cancelResponse() {
    console.log('[WebSocket] cancelResponse() called');
    const result = this.sendMessage({
      type: "response.cancel",
    });
    console.log('[WebSocket] cancelResponse() sent:', result);
    return result;
  }

  updateSession(config = this.config.REALTIME_CONFIG || REALTIME_CONFIG) {
    const turnDetection = config.turnDetection || {};
    const session = {
      modalities: config.modalities,
      voice: config.voice,
      input_audio_format: config.inputAudioFormat,
      output_audio_format: config.outputAudioFormat,
      input_audio_transcription: config.inputAudioTranscription,
      turn_detection: {
        type: turnDetection.type || "server_vad",
        threshold: turnDetection.threshold ?? 0.5,
        prefix_padding_ms: turnDetection.prefixPaddingMs ?? 300,
        silence_duration_ms: turnDetection.silenceDurationMs ?? 500,
        create_response: turnDetection.createResponse ?? true,
        interrupt_response: turnDetection.interruptResponse ?? true,
      },
    };

    return this.sendMessage({
      type: "session.update",
      session,
    });
  }

  onMessage(callback) {
    this._messageCallbacks.add(callback);
    return () => this._messageCallbacks.delete(callback);
  }

  onStatusChange(callback) {
    this._statusCallbacks.add(callback);
    return () => this._statusCallbacks.delete(callback);
  }

  onAudioDelta(callback) {
    this._audioDeltaCallbacks.add(callback);
    return () => this._audioDeltaCallbacks.delete(callback);
  }

  onAudioTranscript(callback) {
    this._audioTranscriptCallbacks.add(callback);
    return () => this._audioTranscriptCallbacks.delete(callback);
  }

  onSpeechStart(callback) {
    this._speechStartCallbacks.add(callback);
    return () => this._speechStartCallbacks.delete(callback);
  }

  onSpeechStop(callback) {
    this._speechStopCallbacks.add(callback);
    return () => this._speechStopCallbacks.delete(callback);
  }

  onVisualAnalysis(callback) {
    this._visualAnalysisCallbacks.add(callback);
    return () => this._visualAnalysisCallbacks.delete(callback);
  }

  connectGemini() {
    if (this.geminiWs && this.geminiWs.readyState === OPEN_STATE) {
      return;
    }

    this.geminiWs = new WebSocket(this.config.GEMINI_WS_URL);
    this.geminiWs.onopen = () => {
      console.log("[Gemini WebSocket] Connected");
    };
    this.geminiWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "visual_analysis") {
          this._emitVisualAnalysis(data.content);
        }
      } catch (e) {
        console.error("[Gemini WebSocket] Failed to parse message:", e);
      }
    };
    this.geminiWs.onerror = (event) => {
      console.error("[Gemini WebSocket] Error:", event);
    };
    this.geminiWs.onclose = () => {
      console.log("[Gemini WebSocket] Closed");
      this.geminiWs = null;
    };
  }

  sendVideoFrame(frameBlob) {
    if (!this.geminiWs || this.geminiWs.readyState !== OPEN_STATE) {
      return false;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      this.geminiWs.send(
        JSON.stringify({
          type: "video_frame",
          frame: base64,
          timestamp: Date.now(),
        })
      );
    };
    reader.readAsDataURL(frameBlob);
    return true;
  }

  sendVideoBatch(frameBatch) {
    if (!this.geminiWs || this.geminiWs.readyState !== OPEN_STATE) {
      return false;
    }

    // 将所有帧转换为 base64
    const promises = frameBatch.map((blob) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        };
        reader.readAsDataURL(blob);
      });
    });

    Promise.all(promises).then((base64Frames) => {
      this.geminiWs.send(
        JSON.stringify({
          type: "video_batch",
          frames: base64Frames,
          count: base64Frames.length,
          timestamp: Date.now(),
        })
      );
      console.log(`[WebSocket] Sent batch of ${base64Frames.length} frames`);
    });

    return true;
  }

  _handleOpen() {
    this._reconnectAttempts = 0;
    this._setStatus(STATUS.CONNECTED);
  }

  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "response.audio.delta") {
        const base64 = data.audio || data.delta || "";
        if (base64) {
          const chunk = base64ToInt16Array(base64);
          this._emitAudioDelta(chunk, data);
        }
      } else if (data.type === "response.audio.done") {
        this._emitAudioDelta(null, data);
      } else if (data.type === "input_audio_buffer.speech_started") {
        this._emitSpeechStart(data);
      } else if (data.type === "input_audio_buffer.speech_stopped") {
        this._emitSpeechStop(data);
      } else if (data.type === "input_audio_buffer.committed") {
        // no-op: forwarded by generic message callbacks
      } else if (
        data.type === "conversation.item.input_audio_transcription.completed"
      ) {
        this._emitAudioTranscript(
          {
            kind: "user",
            done: true,
            text: data.transcript || "",
          },
          data
        );
      } else if (data.type === "response.audio_transcript.delta") {
        this._emitAudioTranscript(
          {
            kind: "assistant",
            done: false,
            text: data.delta || "",
          },
          data
        );
      } else if (data.type === "response.audio_transcript.done") {
        this._emitAudioTranscript(
          {
            kind: "assistant",
            done: true,
            text: data.transcript || "",
          },
          data
        );
      }

      this._emitMessage(data);
    } catch (_) {
      return;
    }
  }

  _handleError(_event) {
    this._setStatus(STATUS.ERROR);
  }

  _handleClose(_event) {
    this.ws = null;
    this._setStatus(STATUS.DISCONNECTED);

    if (!this._manualClose) {
      this.reconnect();
    }
  }

  _setStatus(nextStatus) {
    if (this.status === nextStatus) {
      return;
    }

    this.status = nextStatus;
    for (const callback of this._statusCallbacks) {
      callback(this.status);
    }
  }

  _emitMessage(message) {
    for (const callback of this._messageCallbacks) {
      callback(message);
    }
  }

  _emitAudioDelta(chunk, raw) {
    for (const callback of this._audioDeltaCallbacks) {
      callback(chunk, raw);
    }
  }

  _emitAudioTranscript(payload, raw) {
    for (const callback of this._audioTranscriptCallbacks) {
      callback(payload, raw);
    }
  }

  _emitSpeechStart(raw) {
    for (const callback of this._speechStartCallbacks) {
      callback(raw);
    }
  }

  _emitSpeechStop(raw) {
    for (const callback of this._speechStopCallbacks) {
      callback(raw);
    }
  }

  _emitVisualAnalysis(content) {
    for (const callback of this._visualAnalysisCallbacks) {
      callback(content);
    }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
