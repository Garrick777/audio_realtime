import { CONFIG, STATUS } from "./config.js";

const DEFAULT_STATUS_TEXT = Object.freeze({
  [STATUS.DISCONNECTED]: "未连接",
  [STATUS.CONNECTING]: "正在连接...",
  [STATUS.CONNECTED]: "已连接",
  [STATUS.ERROR]: "连接错误",
});

export class UIManager {
  constructor(config = CONFIG) {
    this.config = config;
    this.elements = this._getElements();
    this.lastAIMessage = null;

    if (this.elements.messageInput) {
      this.elements.messageInput.placeholder = this.config.UI.MESSAGE_INPUT_PLACEHOLDER;
    }
  }

  updateStatus(status, text) {
    const { statusEl } = this.elements;
    if (!statusEl) {
      return;
    }

    statusEl.className = `status ${status}`;
    statusEl.textContent = text || DEFAULT_STATUS_TEXT[status] || "";
  }

  addMessage(content, type = "system") {
    const { chatArea } = this.elements;
    if (!chatArea) {
      return null;
    }

    const messageElement = this._createMessageElement(content, type);
    chatArea.appendChild(messageElement);
    this._scrollToBottom();
    return messageElement;
  }

  appendToAIMessage(text) {
    const { chatArea } = this.elements;
    if (!chatArea) {
      return;
    }

    if (!this.lastAIMessage) {
      this.lastAIMessage = this._createMessageElement("", "ai");
      chatArea.appendChild(this.lastAIMessage);
    }

    const contentEl = this.lastAIMessage.querySelector(".content");
    if (contentEl) {
      contentEl.textContent += text;
    }

    this._scrollToBottom();
  }

  resetAIMessage() {
    this.lastAIMessage = null;
  }

  enableInput() {
    const { messageInput, sendBtn } = this.elements;
    if (messageInput) {
      messageInput.disabled = false;
    }
    if (sendBtn) {
      sendBtn.disabled = false;
    }
  }

  disableInput() {
    const { messageInput, sendBtn } = this.elements;
    if (messageInput) {
      messageInput.disabled = true;
    }
    if (sendBtn) {
      sendBtn.disabled = true;
    }
  }

  clearInput() {
    const { messageInput } = this.elements;
    if (messageInput) {
      messageInput.value = "";
    }
  }

  getInputValue() {
    const { messageInput } = this.elements;
    return messageInput ? messageInput.value : "";
  }

  _getElements() {
    return {
      statusEl: document.getElementById("status"),
      chatArea: document.getElementById("chatArea"),
      messageInput: document.getElementById("messageInput"),
      sendBtn: document.getElementById("sendBtn"),
      connectBtn: document.getElementById("connectBtn"),
      disconnectBtn: document.getElementById("disconnectBtn"),
    };
  }

  _createMessageElement(content, type) {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${type}`;

    const contentElement = document.createElement("div");
    contentElement.className = "content";
    contentElement.textContent = content;
    messageElement.appendChild(contentElement);

    if (this.config.UI.SHOW_TIMESTAMPS) {
      const timestampElement = document.createElement("div");
      timestampElement.className = "timestamp";
      timestampElement.textContent = new Date().toLocaleTimeString();
      messageElement.appendChild(timestampElement);
    }

    return messageElement;
  }

  _scrollToBottom() {
    const { chatArea } = this.elements;
    if (!chatArea || !this.config.UI.AUTO_SCROLL) {
      return;
    }
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

