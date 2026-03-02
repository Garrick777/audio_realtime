import test from "node:test";
import assert from "node:assert/strict";

import {
  CONFIG,
  MESSAGE_TYPES,
  REALTIME_CONFIG,
  STATUS,
} from "../../js/config.js";
import { WebSocketManager } from "../../js/websocket.js";

function ensureBase64Globals() {
  if (typeof globalThis.btoa !== "function") {
    globalThis.btoa = (input) => Buffer.from(input, "binary").toString("base64");
  }
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (input) => Buffer.from(input, "base64").toString("binary");
  }
}

function withGlobals(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, globalThis[key]);
    globalThis[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous.entries()) {
      globalThis[key] = value;
    }
  }
}

test("WebSocketManager connect/open/disconnect updates status", () => {
  ensureBase64Globals();

  class FakeWebSocket {
    static instances = [];

    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      this.closed = false;
      FakeWebSocket.instances.push(this);
    }

    send(payload) {
      this.sent.push(payload);
    }

    close() {
      this.closed = true;
      this.readyState = 3;
      if (typeof this.onclose === "function") {
        this.onclose({ code: 1000 });
      }
    }
  }

  withGlobals({ WebSocket: FakeWebSocket }, () => {
    const manager = new WebSocketManager(CONFIG);
    const statuses = [];
    manager.onStatusChange((status) => statuses.push(status));

    manager.connect();
    assert.equal(manager.status, STATUS.CONNECTING);
    assert.equal(FakeWebSocket.instances.length, 1);
    assert.equal(FakeWebSocket.instances[0].url, CONFIG.WS_URL);

    manager.connect();
    assert.equal(FakeWebSocket.instances.length, 1);

    FakeWebSocket.instances[0].onopen();
    assert.equal(manager.status, STATUS.CONNECTED);

    manager.connect();
    assert.equal(FakeWebSocket.instances.length, 1);

    manager.disconnect();
    assert.equal(FakeWebSocket.instances[0].closed, true);
    assert.equal(manager.status, STATUS.DISCONNECTED);
    assert.equal(manager.ws, null);

    assert.deepEqual(statuses, [
      STATUS.CONNECTING,
      STATUS.CONNECTED,
      STATUS.DISCONNECTED,
    ]);
  });
});

test("WebSocketManager disconnect handles no-socket and non-open socket", () => {
  const manager = new WebSocketManager(CONFIG);

  manager.disconnect();
  assert.equal(manager.status, STATUS.DISCONNECTED);

  let closeCalls = 0;
  manager.ws = {
    readyState: 0,
    close() {
      closeCalls += 1;
    },
  };
  manager.disconnect();
  assert.equal(closeCalls, 0);
  assert.equal(manager.ws, null);
  assert.equal(manager.status, STATUS.DISCONNECTED);
});

test("WebSocketManager sendMessage/sendUserText behaviors", () => {
  const manager = new WebSocketManager(CONFIG);
  const sent = [];

  manager.ws = {
    readyState: 1,
    send(payload) {
      sent.push(payload);
    },
  };

  assert.equal(manager.sendMessage("raw-string"), true);
  assert.equal(sent[0], "raw-string");

  const ok = manager.sendUserText(" hello ");
  assert.equal(ok, true);
  assert.equal(sent.length, 3);

  const conversation = JSON.parse(sent[1]);
  const response = JSON.parse(sent[2]);
  assert.equal(conversation.type, MESSAGE_TYPES.CONVERSATION_ITEM_CREATE);
  assert.equal(conversation.item.content[0].text, "hello");
  assert.equal(response.type, MESSAGE_TYPES.RESPONSE_CREATE);

  assert.equal(manager.sendUserText("   "), false);

  manager.ws = null;
  assert.equal(manager.sendMessage({ any: "value" }), false);
});

test("WebSocketManager audio commands and session update format", () => {
  ensureBase64Globals();
  const manager = new WebSocketManager(CONFIG);
  const payloads = [];
  manager.sendMessage = (payload) => {
    payloads.push(payload);
    return true;
  };

  assert.equal(manager.sendAudioChunk(new Int16Array()), false);
  assert.equal(manager.sendAudioChunk(null), false);
  assert.equal(manager.sendAudioChunk(new Int16Array([1, -2, 3])), true);
  assert.equal(payloads[0].type, "input_audio_buffer.append");
  assert.equal(typeof payloads[0].audio, "string");
  assert.equal(payloads[0].audio.length > 0, true);

  manager.commitAudioInput();
  manager.clearAudioInput();
  manager.cancelResponse();
  assert.deepEqual(
    payloads.slice(1, 4).map((item) => item.type),
    ["input_audio_buffer.commit", "input_audio_buffer.clear", "response.cancel"]
  );

  manager.updateSession({
    modalities: ["audio", "text"],
    voice: "alloy",
    inputAudioFormat: "pcm16",
    outputAudioFormat: "pcm16",
    inputAudioTranscription: { model: "whisper-1" },
    turnDetection: {
      threshold: 0.81,
      prefix_padding_ms: 222,
      silenceDurationMs: 333,
      create_response: false,
      interruptResponse: false,
    },
  });

  const sessionUpdate = payloads[4];
  assert.equal(sessionUpdate.type, "session.update");
  assert.deepEqual(sessionUpdate.session.turn_detection, {
    type: "server_vad",
    threshold: 0.81,
    prefix_padding_ms: 222,
    silence_duration_ms: 333,
    create_response: false,
    interrupt_response: false,
  });

  const fallbackManager = new WebSocketManager(CONFIG);
  let fallbackPayload = null;
  fallbackManager.sendMessage = (payload) => {
    fallbackPayload = payload;
    return true;
  };
  fallbackManager.updateSession(REALTIME_CONFIG);
  assert.equal(fallbackPayload.type, "session.update");
  assert.equal(
    fallbackPayload.session.turn_detection.create_response,
    true
  );
});

test("WebSocketManager parses inbound events and emits callbacks", () => {
  ensureBase64Globals();
  const manager = new WebSocketManager(CONFIG);
  const messages = [];
  const audio = [];
  const transcripts = [];
  const speech = [];

  manager.onMessage((msg) => messages.push(msg.type));
  manager.onAudioDelta((chunk, raw) => audio.push({ chunk, type: raw.type }));
  manager.onAudioTranscript((payload, raw) => {
    transcripts.push({ payload, type: raw.type });
  });
  manager.onSpeechStart(() => speech.push("start"));
  manager.onSpeechStop(() => speech.push("stop"));

  const audioBase64 = Buffer.from(new Int16Array([300, -300]).buffer).toString(
    "base64"
  );

  manager._handleMessage({
    data: JSON.stringify({ type: "response.audio.delta", audio: audioBase64 }),
  });
  manager._handleMessage({
    data: JSON.stringify({ type: "response.audio.done" }),
  });
  manager._handleMessage({
    data: JSON.stringify({ type: "input_audio_buffer.speech_started" }),
  });
  manager._handleMessage({
    data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }),
  });
  manager._handleMessage({
    data: JSON.stringify({ type: "input_audio_buffer.committed" }),
  });
  manager._handleMessage({
    data: JSON.stringify({
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "用户文本",
    }),
  });
  manager._handleMessage({
    data: JSON.stringify({
      type: "response.audio_transcript.delta",
      delta: "AI",
    }),
  });
  manager._handleMessage({
    data: JSON.stringify({
      type: "response.audio_transcript.done",
      transcript: "AI 完整回复",
    }),
  });
  manager._handleMessage({ data: "{not-json" });

  assert.equal(audio.length, 2);
  assert.equal(audio[0].chunk instanceof Int16Array, true);
  assert.equal(audio[0].chunk.length, 2);
  assert.equal(audio[1].chunk, null);

  assert.deepEqual(speech, ["start", "stop"]);
  assert.equal(transcripts.length, 3);
  assert.equal(transcripts[0].payload.kind, "user");
  assert.equal(transcripts[1].payload.kind, "assistant");
  assert.equal(transcripts[2].payload.done, true);
  assert.equal(messages.length, 8);
});

test("WebSocketManager reconnect behavior and close handling", () => {
  const scheduled = [];
  const cleared = [];

  class DummyWebSocket {
    constructor() {
      this.readyState = 1;
    }
  }

  withGlobals(
    {
      WebSocket: DummyWebSocket,
      setTimeout: (fn, delay) => {
        scheduled.push({ fn, delay });
        return scheduled.length;
      },
      clearTimeout: (id) => {
        cleared.push(id);
      },
    },
    () => {
      const manager = new WebSocketManager({
        ...CONFIG,
        RECONNECT: {
          ENABLED: true,
          MAX_ATTEMPTS: 2,
          INITIAL_DELAY_MS: 100,
          MAX_DELAY_MS: 1000,
          BACKOFF_FACTOR: 2,
        },
      });

      manager.reconnect();
      assert.equal(scheduled.length, 1);
      assert.equal(scheduled[0].delay, 100);
      assert.equal(manager._reconnectAttempts, 1);

      manager._reconnectAttempts = 2;
      manager.reconnect();
      assert.equal(manager.status, STATUS.ERROR);

      const manualManager = new WebSocketManager(CONFIG);
      manualManager._manualClose = true;
      manualManager.reconnect();
      assert.equal(scheduled.length, 1);

      let reconnectCalls = 0;
      manager.reconnect = () => {
        reconnectCalls += 1;
      };
      manager._manualClose = false;
      manager.ws = {};
      manager._handleClose({ code: 1006 });
      assert.equal(manager.ws, null);
      assert.equal(manager.status, STATUS.DISCONNECTED);
      assert.equal(reconnectCalls, 1);

      manager._manualClose = true;
      manager.ws = {};
      manager._handleClose({ code: 1000 });
      assert.equal(reconnectCalls, 1);

      manager._reconnectTimer = 42;
      manager._clearReconnectTimer();
      assert.equal(manager._reconnectTimer, null);

      assert.equal(Array.isArray(cleared), true);
    }
  );
});

test("WebSocketManager handles error status and callback unsubscribe", () => {
  const manager = new WebSocketManager(CONFIG);
  const statuses = [];
  const messages = [];

  const offStatus = manager.onStatusChange((status) => statuses.push(status));
  const offMessage = manager.onMessage((msg) => messages.push(msg.type));

  manager._handleError(new Error("network"));
  assert.equal(manager.status, STATUS.ERROR);
  assert.deepEqual(statuses, [STATUS.ERROR]);

  offStatus();
  offMessage();

  manager._setStatus(STATUS.CONNECTING);
  manager._emitMessage({ type: "x" });
  assert.deepEqual(statuses, [STATUS.ERROR]);
  assert.deepEqual(messages, []);
});

test("WebSocketManager callback registration returns no-op for invalid callback", () => {
  const manager = new WebSocketManager(CONFIG);

  const unsubs = [
    manager.onMessage(null),
    manager.onStatusChange(undefined),
    manager.onAudioDelta(123),
    manager.onAudioTranscript("x"),
    manager.onSpeechStart({}),
    manager.onSpeechStop(false),
  ];

  for (const unsub of unsubs) {
    assert.equal(typeof unsub, "function");
    assert.doesNotThrow(() => unsub());
  }
});
