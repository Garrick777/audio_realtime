import test from "node:test";
import assert from "node:assert/strict";

import { UI_MODE } from "../../js/config.js";
import { CALL_STATES } from "../../js/state-machine.js";
import { VoiceUIController } from "../../js/ui-controller.js";

function createClassList() {
  const classes = new Set();
  return {
    add(name) {
      classes.add(name);
    },
    remove(name) {
      classes.delete(name);
    },
    toggle(name, force) {
      if (typeof force === "boolean") {
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
        return;
      }
      if (classes.has(name)) {
        classes.delete(name);
      } else {
        classes.add(name);
      }
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function createElement() {
  const listeners = new Map();
  return {
    style: {},
    dataset: {},
    classList: createClassList(),
    disabled: false,
    textContent: "",
    attributes: new Map(),
    addEventListener(eventName, handler) {
      listeners.set(eventName, handler);
    },
    click() {
      const handler = listeners.get("click");
      if (typeof handler === "function") {
        handler();
      }
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name);
    },
  };
}

function withMockDocument(run) {
  const previousDocument = globalThis.document;
  const elements = {
    textModeBtn: createElement(),
    voiceModeBtn: createElement(),
    callToggleBtn: createElement(),
    callToggleText: createElement(),
    volumeBar: createElement(),
    voiceStatus: createElement(),
    voiceHint: createElement(),
    textMode: createElement(),
    voiceMode: createElement(),
  };

  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    },
  };

  try {
    run(elements);
  } finally {
    globalThis.document = previousDocument;
  }
}

test("VoiceUIController binds mode and call toggle handlers", () => {
  withMockDocument((elements) => {
    const ui = new VoiceUIController();
    let textCalls = 0;
    let voiceCalls = 0;
    let callToggleCalls = 0;

    ui.bindModeHandlers(
      () => {
        textCalls += 1;
      },
      () => {
        voiceCalls += 1;
      }
    );
    ui.bindCallToggle(() => {
      callToggleCalls += 1;
    });

    elements.textModeBtn.click();
    elements.voiceModeBtn.click();
    elements.callToggleBtn.click();

    assert.equal(textCalls, 1);
    assert.equal(voiceCalls, 1);
    assert.equal(callToggleCalls, 1);
  });
});

test("VoiceUIController setMode toggles visibility and active states", () => {
  withMockDocument((elements) => {
    const ui = new VoiceUIController();

    ui.setMode(UI_MODE.TEXT);
    assert.equal(elements.textMode.style.display, "");
    assert.equal(elements.voiceMode.style.display, "none");
    assert.equal(elements.textModeBtn.disabled, true);
    assert.equal(elements.voiceModeBtn.disabled, false);
    assert.equal(elements.textModeBtn.classList.contains("active"), true);

    ui.setMode(UI_MODE.VOICE);
    assert.equal(elements.textMode.style.display, "none");
    assert.equal(elements.voiceMode.style.display, "");
    assert.equal(elements.textModeBtn.disabled, false);
    assert.equal(elements.voiceModeBtn.disabled, true);
    assert.equal(elements.voiceModeBtn.classList.contains("active"), true);
  });
});

test("VoiceUIController updates call button, state text and hint", () => {
  withMockDocument((elements) => {
    const ui = new VoiceUIController();

    ui.setCallActive(true);
    assert.equal(elements.callToggleBtn.classList.contains("active"), true);
    assert.equal(elements.callToggleBtn.getAttribute("aria-pressed"), "true");
    assert.equal(elements.callToggleText.textContent, "结束通话");

    ui.setCallActive(false);
    assert.equal(elements.callToggleBtn.getAttribute("aria-pressed"), "false");
    assert.equal(elements.callToggleText.textContent, "开始通话");

    ui.setCallState(CALL_STATES.AI_SPEAKING);
    assert.equal(elements.voiceMode.dataset.callState, CALL_STATES.AI_SPEAKING);
    assert.equal(elements.voiceMode.classList.contains("ai-speaking"), true);
    assert.equal(elements.voiceStatus.textContent, "AI 正在回复...");

    ui.setCallState("unknown-state");
    assert.equal(elements.voiceStatus.textContent, "准备开始通话");

    ui.setVoiceHint("自动监听中");
    assert.equal(elements.voiceHint.textContent, "自动监听中");
  });
});

test("VoiceUIController setVolume clamps and rounds percentage", () => {
  withMockDocument((elements) => {
    const ui = new VoiceUIController();

    ui.setVolume(-1);
    assert.equal(elements.volumeBar.style.width, "0%");

    ui.setVolume(0.456);
    assert.equal(elements.volumeBar.style.width, "46%");

    ui.setVolume(8);
    assert.equal(elements.volumeBar.style.width, "100%");
  });
});

test("VoiceUIController defensive branches with missing elements", () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById() {
      return null;
    },
  };

  try {
    const ui = new VoiceUIController();
    assert.doesNotThrow(() => ui.bindCallToggle(null));
    assert.doesNotThrow(() => ui.setCallActive(true));
    assert.doesNotThrow(() => ui.setCallButtonDisabled(true));
    assert.doesNotThrow(() => ui.setVolume(0.5));
  } finally {
    globalThis.document = previousDocument;
  }
});
