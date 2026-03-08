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
  }

  updateStatus(status, text) {
    const { statusEl } = this.elements;
    if (!statusEl) {
      return;
    }

    statusEl.className = `status ${status}`;
    statusEl.textContent = text || DEFAULT_STATUS_TEXT[status] || "";
  }

  _getElements() {
    return {
      statusEl: document.getElementById("status"),
      connectBtn: document.getElementById("connectBtn"),
      disconnectBtn: document.getElementById("disconnectBtn"),
    };
  }
}

