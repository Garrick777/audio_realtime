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

  bindModeHandlers(onTextMode, onVoiceMode) {
    const { textModeBtn, voiceModeBtn } = this.elements;

    if (textModeBtn) {
      textModeBtn.addEventListener("click", () => {
        if (typeof onTextMode === "function") {
          onTextMode();
        }
      });
    }

    if (voiceModeBtn) {
      voiceModeBtn.addEventListener("click", () => {
        if (typeof onVoiceMode === "function") {
          onVoiceMode();
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

  setMode(mode) {
    const { textControls, voiceControls, textModeBtn, voiceModeBtn } = this.elements;

    if (textControls) {
      textControls.style.display = mode === UI_MODE.TEXT ? "" : "none";
    }
    if (voiceControls) {
      voiceControls.style.display = mode === UI_MODE.VOICE ? "" : "none";
    }

    if (textModeBtn) {
      textModeBtn.disabled = mode === UI_MODE.TEXT;
      textModeBtn.classList.toggle("active", mode === UI_MODE.TEXT);
    }
    if (voiceModeBtn) {
      voiceModeBtn.disabled = mode === UI_MODE.VOICE;
      voiceModeBtn.classList.toggle("active", mode === UI_MODE.VOICE);
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
    const { volumeBar } = this.elements;
    if (!volumeBar) {
      return;
    }

    const clamped = Math.max(0, Math.min(1, Number(volume) || 0));
    volumeBar.style.width = `${Math.round(clamped * 100)}%`;
  }

  _getElements() {
    return {
      textModeBtn: document.getElementById("textModeBtn"),
      voiceModeBtn: document.getElementById("voiceModeBtn"),
      callToggleBtn: document.getElementById("callToggleBtn"),
      callToggleText: document.getElementById("callToggleText"),
      volumeBar: document.getElementById("volumeBar"),
      voiceStatus: document.getElementById("voiceStatus"),
      voiceHint: document.getElementById("voiceHint"),
      textControls: document.getElementById("textMode"),
      voiceControls: document.getElementById("voiceMode"),
    };
  }
}
