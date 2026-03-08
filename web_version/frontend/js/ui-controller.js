import { UI_MODE } from "./config.js";
import { CALL_STATES } from "./state-machine.js";

const VOICE_STATUS_TEXT = Object.freeze({
  [CALL_STATES.IDLE]: "准备开始通话",
  [CALL_STATES.CONNECTING]: "连接中...",
  [CALL_STATES.READY]: "通话已连接，请说话",
  [CALL_STATES.USER_SPEAKING]: "你正在说话...",
  [CALL_STATES.PROCESSING]: "AI 正在处理中...",
  [CALL_STATES.AI_SPEAKING]: "AI 正在回复...",
  [CALL_STATES.ERROR]: "通话异常，请重试",
});

export class VoiceUIController {
  constructor() {
    this.elements = this._getElements();
  }

  bindModeHandlers(onVoiceMode, onVideoMode) {
    const { voiceModeBtn, videoModeBtn } = this.elements;

    if (voiceModeBtn) {
      voiceModeBtn.addEventListener("click", () => {
        if (typeof onVoiceMode === "function") {
          onVoiceMode();
        }
      });
    }

    if (videoModeBtn) {
      videoModeBtn.addEventListener("click", () => {
        if (typeof onVideoMode === "function") {
          onVideoMode();
        }
      });
    }
  }

  bindCallToggle(handler) {
    const { callToggleBtn } = this.elements;
    if (!callToggleBtn || typeof handler !== "function") {
      return;
    }
    callToggleBtn.addEventListener("click", () => handler());
  }

  bindVideoCallToggle(handler) {
    const { videoCallToggleBtn } = this.elements;
    if (!videoCallToggleBtn || typeof handler !== "function") {
      return;
    }
    videoCallToggleBtn.addEventListener("click", () => handler());
  }

  bindPreviewToggle(handler) {
    const { togglePreviewBtn } = this.elements;
    if (!togglePreviewBtn || typeof handler !== "function") {
      return;
    }
    togglePreviewBtn.addEventListener("click", () => handler());
  }

  setMode(mode) {
    const { voiceControls, videoControls, voiceModeBtn, videoModeBtn } = this.elements;

    if (voiceControls) {
      voiceControls.style.display = mode === UI_MODE.VOICE ? "" : "none";
    }
    if (videoControls) {
      videoControls.style.display = mode === UI_MODE.VIDEO ? "" : "none";
    }

    if (voiceModeBtn) {
      voiceModeBtn.disabled = mode === UI_MODE.VOICE;
      voiceModeBtn.classList.toggle("active", mode === UI_MODE.VOICE);
    }
    if (videoModeBtn) {
      videoModeBtn.disabled = mode === UI_MODE.VIDEO;
      videoModeBtn.classList.toggle("active", mode === UI_MODE.VIDEO);
    }
  }

  setCallActive(active) {
    const { callToggleBtn, callToggleText } = this.elements;
    if (!callToggleBtn) {
      return;
    }

    callToggleBtn.classList.toggle("active", Boolean(active));
    callToggleBtn.setAttribute("aria-pressed", active ? "true" : "false");
    if (callToggleText) {
      callToggleText.textContent = active ? "结束通话" : "开始通话";
    }
  }

  setCallButtonDisabled(disabled) {
    const { callToggleBtn } = this.elements;
    if (callToggleBtn) {
      callToggleBtn.disabled = Boolean(disabled);
    }
  }

  setCallState(callState) {
    const { voiceControls, voiceStatus } = this.elements;

    if (voiceControls) {
      voiceControls.dataset.callState = callState || CALL_STATES.IDLE;
      voiceControls.classList.toggle("ai-speaking", callState === CALL_STATES.AI_SPEAKING);
    }

    if (voiceStatus) {
      voiceStatus.textContent = VOICE_STATUS_TEXT[callState] || VOICE_STATUS_TEXT[CALL_STATES.IDLE];
    }
  }

  setVoiceHint(text) {
    const { voiceHint } = this.elements;
    if (voiceHint && typeof text === "string") {
      voiceHint.textContent = text;
    }
  }

  setVolume(volume) {
    const { volumeBar, videoVolumeBar } = this.elements;
    const clamped = Math.max(0, Math.min(1, Number(volume) || 0));
    const widthPercent = `${Math.round(clamped * 100)}%`;

    if (volumeBar) {
      volumeBar.style.width = widthPercent;
    }
    if (videoVolumeBar) {
      videoVolumeBar.style.width = widthPercent;
    }
  }

  setVideoCallActive(active) {
    const { videoCallToggleBtn, videoCallToggleText } = this.elements;
    if (!videoCallToggleBtn) {
      return;
    }

    videoCallToggleBtn.classList.toggle("active", Boolean(active));
    videoCallToggleBtn.setAttribute("aria-pressed", active ? "true" : "false");
    if (videoCallToggleText) {
      videoCallToggleText.textContent = active ? "结束视频通话" : "开始视频通话";
    }
  }

  setVideoCallButtonDisabled(disabled) {
    const { videoCallToggleBtn } = this.elements;
    if (videoCallToggleBtn) {
      videoCallToggleBtn.disabled = Boolean(disabled);
    }
  }

  setVideoHint(text) {
    const { videoHint } = this.elements;
    if (videoHint && typeof text === "string") {
      videoHint.textContent = text;
    }
  }

  updateVisualAnalysis(content) {
    const { visualAnalysisContent } = this.elements;
    if (!visualAnalysisContent) {
      return;
    }

    const formatted = this._formatVisualContent(content);
    const timestamp = new Date().toLocaleTimeString();

    const itemHtml = `
      <div class="visual-item">
        <span class="timestamp">${timestamp}</span>
        <p>${formatted}</p>
      </div>
    `;

    visualAnalysisContent.insertAdjacentHTML("afterbegin", itemHtml);

    const items = visualAnalysisContent.querySelectorAll(".visual-item");
    if (items.length > 10) {
      items[items.length - 1].remove();
    }
  }

  _formatVisualContent(content) {
    if (typeof content !== "string") {
      return String(content);
    }
    return content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  _getElements() {
    return {
      voiceModeBtn: document.getElementById("voiceModeBtn"),
      videoModeBtn: document.getElementById("videoModeBtn"),
      callToggleBtn: document.getElementById("callToggleBtn"),
      callToggleText: document.getElementById("callToggleText"),
      videoCallToggleBtn: document.getElementById("videoCallToggleBtn"),
      videoCallToggleText: document.getElementById("videoCallToggleText"),
      togglePreviewBtn: document.getElementById("togglePreviewBtn"),
      volumeBar: document.getElementById("volumeBar"),
      videoVolumeBar: document.getElementById("videoVolumeBar"),
      voiceStatus: document.getElementById("voiceStatus"),
      voiceHint: document.getElementById("voiceHint"),
      videoHint: document.getElementById("videoHint"),
      visualAnalysisContent: document.getElementById("visualAnalysisContent"),
      voiceControls: document.getElementById("voiceMode"),
      videoControls: document.getElementById("videoMode"),
    };
  }
}
