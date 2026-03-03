import { CONFIG, MESSAGE_TYPES, STATUS } from "./config.js";

const OPEN_STATE = 1;
const DEFAULT_INSTRUCTIONS =
  "You are a helpful AI assistant. Please respond in the same language as the user.";

export class WebSocketManager {
  constructor(config = CONFIG) {
    this.config = config;
    this.ws = null;
    this.status = STATUS.DISCONNECTED;

    this._manualClose = false;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;

    this._messageCallbacks = new Set();
    this._statusCallbacks = new Set();
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
    const userText = String(text ?? "").trim();
    if (!userText) {
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
            text: userText,
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

  onMessage(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this._messageCallbacks.add(callback);
    return () => this._messageCallbacks.delete(callback);
  }

  onStatusChange(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this._statusCallbacks.add(callback);
    return () => this._statusCallbacks.delete(callback);
  }

  _handleOpen() {
    this._reconnectAttempts = 0;
    this._setStatus(STATUS.CONNECTED);
  }

  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
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

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}
