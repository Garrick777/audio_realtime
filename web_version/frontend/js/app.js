import { MESSAGE_TYPES, STATUS } from "./config.js";
import { UIManager } from "./ui.js";
import { WebSocketManager } from "./websocket.js";

export class App {
  constructor() {
    this.ui = new UIManager();
    this.ws = new WebSocketManager();

    this._bindEvents();
    this.ws.onStatusChange((status) => this._handleStatusChange(status));
    this.ws.onMessage((data) => this._handleServerMessage(data));

    this._handleStatusChange(STATUS.DISCONNECTED);
  }

  _bindEvents() {
    const { connectBtn, disconnectBtn, sendBtn, messageInput } = this.ui.elements;

    if (connectBtn) {
      connectBtn.addEventListener("click", () => this.ws.connect());
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => this.ws.disconnect());
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", () => this._sendMessage());
    }

    if (messageInput) {
      messageInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
          this._sendMessage();
        }
      });
    }
  }

  _handleStatusChange(status) {
    const { connectBtn, disconnectBtn } = this.ui.elements;

    if (status === STATUS.CONNECTING) {
      this.ui.updateStatus(STATUS.CONNECTING, "正在连接...");
      this.ui.disableInput();
      if (connectBtn) connectBtn.disabled = true;
      if (disconnectBtn) disconnectBtn.disabled = true;
      return;
    }

    if (status === STATUS.CONNECTED) {
      this.ui.updateStatus(STATUS.CONNECTED, "已连接到服务器");
      this.ui.enableInput();
      if (connectBtn) connectBtn.disabled = true;
      if (disconnectBtn) disconnectBtn.disabled = false;
      return;
    }

    if (status === STATUS.ERROR) {
      this.ui.updateStatus(STATUS.ERROR, "连接错误");
      this.ui.disableInput();
      if (connectBtn) connectBtn.disabled = true;
      if (disconnectBtn) disconnectBtn.disabled = true;
      return;
    }

    this.ui.updateStatus(STATUS.DISCONNECTED, "未连接");
    this.ui.disableInput();
    if (connectBtn) connectBtn.disabled = false;
    if (disconnectBtn) disconnectBtn.disabled = true;
  }

  _handleServerMessage(data) {
    const type = data?.type;

    if (type === MESSAGE_TYPES.SERVER_CONNECTED) {
      this.ui.addMessage(data.message || "服务器连接成功", "system");
      return;
    }

    if (type === MESSAGE_TYPES.REALTIME_CONNECTED) {
      this.ui.addMessage(data.message || "Realtime API 连接成功", "system");
      this.ui.updateStatus(STATUS.CONNECTED, "Realtime API 已连接");
      return;
    }

    if (type === MESSAGE_TYPES.SESSION_CREATED) {
      this.ui.addMessage("会话创建成功，可以开始对话", "system");
      return;
    }

    if (type === MESSAGE_TYPES.RESPONSE_TEXT_DELTA) {
      this.ui.appendToAIMessage(data.delta || "");
      return;
    }

    if (type === MESSAGE_TYPES.ERROR) {
      const message = data?.error?.message || data?.message || "未知错误";
      this.ui.addMessage(`错误: ${message}`, "error");
    }
  }

  _sendMessage() {
    const text = this.ui.getInputValue().trim();
    if (!text) {
      return;
    }

    this.ui.addMessage(text, "user");
    this.ui.clearInput();
    this.ui.resetAIMessage();

    const success = this.ws.sendUserText(text);
    if (!success) {
      this.ui.addMessage("发送失败：连接未就绪", "error");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new App();
});

