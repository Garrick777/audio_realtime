import {
  AUDIO_CONFIG,
  MESSAGE_TYPES,
  PLAYER_CONFIG,
  REALTIME_CONFIG,
  STATUS,
  UI_MODE,
} from "./config.js";
import { AudioPlayer } from "./audio-player.js";
import { AudioRecorder } from "./audio-recorder.js";
import { EventBus } from "./event-bus.js";
import { CallStateMachine, CALL_STATES } from "./state-machine.js";
import { UIManager } from "./ui.js";
import { VoiceUIController } from "./ui-controller.js";
import { WebSocketManager } from "./websocket.js";

const STATUS_TEXT_IN_CALL = Object.freeze({
  [CALL_STATES.CONNECTING]: "通话连接中...",
  [CALL_STATES.READY]: "通话中",
  [CALL_STATES.USER_SPEAKING]: "你正在说话",
  [CALL_STATES.PROCESSING]: "AI 处理中",
  [CALL_STATES.AI_SPEAKING]: "AI 正在回复",
  [CALL_STATES.ERROR]: "通话异常",
});

export class App {
  constructor() {
    this.ui = new UIManager();
    this.voiceUI = new VoiceUIController();
    this.ws = new WebSocketManager();
    this.eventBus = new EventBus();
    this.callState = new CallStateMachine(CALL_STATES.IDLE, this.eventBus);

    this.mode = UI_MODE.TEXT;
    this.callRequested = false;
    this.isRealtimeReady = false;
    this.isRecording = false;
    this.isAISpeaking = false;
    this.hasAssistantTranscriptDelta = false;
    this._captureStarting = false;

    this.audioRecorder = new AudioRecorder({
      sampleRate: AUDIO_CONFIG.sampleRate,
      chunkSize: AUDIO_CONFIG.chunkSize,
      workletUrl: AUDIO_CONFIG.workletPath,
      volumeWindowSize: 6,
    });
    this.audioPlayer = new AudioPlayer({
      sampleRate: AUDIO_CONFIG.sampleRate,
      channels: AUDIO_CONFIG.channels,
      minStartChunks: PLAYER_CONFIG.minBufferChunks,
      maxQueueLength: PLAYER_CONFIG.maxQueueSize,
    });

    this._bindEvents();
    this._bindAudioEvents();
    this._bindBusEvents();
    this._bindWebSocketEvents();
    this._initAudioModules();

    this.switchMode(UI_MODE.TEXT);
    this._handleStatusChange(STATUS.DISCONNECTED);
    this.voiceUI.setCallState(CALL_STATES.IDLE);
  }

  _bindEvents() {
    const { connectBtn, disconnectBtn, sendBtn, messageInput } = this.ui.elements;

    if (connectBtn) {
      connectBtn.addEventListener("click", () => this.ws.connect());
    }
    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => {
        if (this.mode === UI_MODE.VOICE) {
          this._endVoiceCall();
          return;
        }
        this.ws.disconnect();
      });
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

    this.voiceUI.bindModeHandlers(
      () => this.switchMode(UI_MODE.TEXT),
      () => this.switchMode(UI_MODE.VOICE)
    );
    this.voiceUI.bindCallToggle(() => this.toggleVoiceCall());
  }

  _bindAudioEvents() {
    this.audioRecorder.onAudioData((pcm16) => {
      if (!this.isRecording || this.ws.status !== STATUS.CONNECTED) {
        return;
      }
      this.ws.sendAudioChunk(pcm16);
    });

    this.audioRecorder.onVolumeChange((volume) => {
      this.voiceUI.setVolume(volume);
    });

    this.audioRecorder.onError((error) => {
      const message = error?.message || "unknown";
      this.ui.addMessage(`Audio recorder error: ${message}`, "error");
      this.callState.transition(CALL_STATES.ERROR, { reason: "recorder_error" });
    });

    this.audioPlayer.onPlayStart(() => this.eventBus.emit("audio:playback_started"));
    this.audioPlayer.onPlayEnd(() => this.eventBus.emit("audio:playback_ended"));
  }

  _bindBusEvents() {
    this.eventBus.on("state:changed", (payload) => this._handleCallStateChanged(payload));
    this.eventBus.on("vad:speech_started", () => this._handleSpeechStart());
    this.eventBus.on("vad:speech_stopped", () => this._handleSpeechStop());
    this.eventBus.on("audio:playback_started", () => this._handlePlaybackStarted());
    this.eventBus.on("audio:playback_ended", () => this._handlePlaybackEnded());
  }

  _bindWebSocketEvents() {
    this.ws.onStatusChange((status) => this._handleStatusChange(status));
    this.ws.onMessage((data) => this._handleServerMessage(data));
    this.ws.onAudioDelta((chunk, raw) => this._handleAudioDelta(chunk, raw));
    this.ws.onAudioTranscript((payload) => this._handleAudioTranscript(payload));
    this.ws.onSpeechStart((raw) => this.eventBus.emit("vad:speech_started", raw));
    this.ws.onSpeechStop((raw) => this.eventBus.emit("vad:speech_stopped", raw));
  }

  async _initAudioModules() {
    try {
      this.audioPlayer.init();
      await this.audioRecorder.init();
    } catch (error) {
      this.ui.addMessage(`Audio init failed: ${error?.message || "unknown"}`, "error");
    }
  }

  toggleVoiceCall() {
    if (this.mode !== UI_MODE.VOICE) {
      return;
    }

    if (this.callRequested || this.callState.state !== CALL_STATES.IDLE) {
      this._endVoiceCall();
    } else {
      this._startVoiceCall();
    }
  }

  _startVoiceCall() {
    this.callRequested = true;
    this.voiceUI.setCallActive(true);
    this.callState.transition(CALL_STATES.CONNECTING, { reason: "user_start_call" });
    this.voiceUI.setVoiceHint("连接成功后将自动开始监听。");

    if (this.ws.status === STATUS.CONNECTED && this.isRealtimeReady) {
      this._beginContinuousCapture();
      return;
    }

    if (this.ws.status === STATUS.DISCONNECTED || this.ws.status === STATUS.ERROR) {
      this.ws.connect();
    }
  }

  _endVoiceCall() {
    this.callRequested = false;
    this._stopContinuousCapture();
    this.isRealtimeReady = false;
    this.hasAssistantTranscriptDelta = false;

    if (this.ws.status !== STATUS.DISCONNECTED) {
      this.ws.disconnect();
    }

    this.callState.transition(CALL_STATES.IDLE, { reason: "user_end_call" });
    this.voiceUI.setCallActive(false);
    this.voiceUI.setVoiceHint("点击开始后将自动持续监听，无需按住按钮。");
  }

  async _beginContinuousCapture() {
    if (!this.callRequested || this.isRecording || this._captureStarting) {
      return;
    }
    if (this.ws.status !== STATUS.CONNECTED || !this.isRealtimeReady) {
      return;
    }

    this._captureStarting = true;
    try {
      await this.audioRecorder.requestPermission();
      this.ws.clearAudioInput();
      await this.audioRecorder.start();

      this.isRecording = true;
      this.voiceUI.setCallActive(true);
      this.callState.transition(CALL_STATES.READY, { reason: "capture_started" });
      this.voiceUI.setVoiceHint("自动监听中，可直接开始说话。");
      this.ui.addMessage("Voice call started", "system");
    } catch (error) {
      const message = error?.message || "unknown";
      this.ui.addMessage(`Start call failed: ${message}`, "error");
      this.callState.transition(CALL_STATES.ERROR, { reason: "capture_start_failed" });
      this.callRequested = false;
      this.voiceUI.setCallActive(false);
      this.ws.disconnect();
    } finally {
      this._captureStarting = false;
    }
  }

  _stopContinuousCapture() {
    this._captureStarting = false;

    if (this.isRecording) {
      this.audioRecorder.stop();
      this.isRecording = false;
    }

    this.audioPlayer.stop();
    this.audioPlayer.clear();
    this.isAISpeaking = false;
    this.voiceUI.setVolume(0);
  }

  _handleStatusChange(status) {
    const { connectBtn, disconnectBtn } = this.ui.elements;
    this._updateConnectionButtons(status, connectBtn, disconnectBtn);

    if (status === STATUS.CONNECTING) {
      this.ui.updateStatus(STATUS.CONNECTING, "Connecting...");
      this.ui.disableInput();
      if (this.mode === UI_MODE.VOICE && this.callRequested) {
        this.callState.transition(CALL_STATES.CONNECTING, { reason: "ws_connecting" });
      }
      return;
    }

    if (status === STATUS.CONNECTED) {
      this.ui.updateStatus(STATUS.CONNECTED, "Connected");
      if (this.mode === UI_MODE.TEXT) {
        this.ui.enableInput();
      } else {
        this.ui.disableInput();
      }
      return;
    }

    if (status === STATUS.ERROR) {
      this.ui.updateStatus(STATUS.ERROR, "Connection error");
      this.ui.disableInput();
      this.isRealtimeReady = false;
      this._stopContinuousCapture();
      this.callState.transition(CALL_STATES.ERROR, { reason: "ws_error" });
      return;
    }

    this.ui.updateStatus(STATUS.DISCONNECTED, "Disconnected");
    this.ui.disableInput();
    this.isRealtimeReady = false;
    this._stopContinuousCapture();

    if (this.callRequested) {
      this.callState.transition(CALL_STATES.CONNECTING, { reason: "ws_reconnecting" });
    } else {
      this.callState.transition(CALL_STATES.IDLE, { reason: "ws_disconnected" });
    }
  }

  _handleServerMessage(data) {
    const type = data?.type;
    if (!type) {
      return;
    }

    if (type === MESSAGE_TYPES.SERVER_CONNECTED) {
      this.ui.addMessage(data.message || "Server connected", "system");
      return;
    }

    if (type === MESSAGE_TYPES.REALTIME_CONNECTED) {
      this.isRealtimeReady = true;
      this.ui.addMessage(data.message || "Realtime API connected", "system");
      this.ws.updateSession(REALTIME_CONFIG);
      if (this.mode === UI_MODE.VOICE && this.callRequested) {
        this._beginContinuousCapture();
      }
      return;
    }

    if (type === MESSAGE_TYPES.SESSION_CREATED) {
      this.ui.addMessage("Session created", "system");
      return;
    }

    if (type === MESSAGE_TYPES.RESPONSE_TEXT_DELTA) {
      this.ui.appendToAIMessage(data.delta || "");
      return;
    }

    if (type === MESSAGE_TYPES.ERROR) {
      const message = data?.error?.message || data?.message || "Unknown error";
      this.ui.addMessage(`Error: ${message}`, "error");
      this.callState.transition(CALL_STATES.ERROR, { reason: "server_error" });
    }
  }

  _handleAudioDelta(chunk, raw) {
    if (chunk instanceof Int16Array && chunk.length > 0) {
      this.audioPlayer.addChunk(chunk);
      this.audioPlayer.start();
      return;
    }

    if (raw?.type === "response.audio.done") {
      this.eventBus.emit("audio:playback_ended");
    }
  }

  _handleAudioTranscript(payload) {
    if (!payload || typeof payload.text !== "string") {
      return;
    }

    if (payload.kind === "user" && payload.done) {
      if (payload.text.trim()) {
        this.ui.addMessage(payload.text, "user");
      }
      return;
    }

    if (payload.kind !== "assistant") {
      return;
    }

    if (!payload.done) {
      if (payload.text) {
        this.ui.appendToAIMessage(payload.text);
        this.hasAssistantTranscriptDelta = true;
      }
      return;
    }

    if (!this.hasAssistantTranscriptDelta && payload.text.trim()) {
      this.ui.addMessage(payload.text, "ai");
    }
    this.hasAssistantTranscriptDelta = false;
    this.ui.resetAIMessage();
  }

  _handleSpeechStart() {
    if (!this.isRecording) {
      return;
    }

    if (this.isAISpeaking) {
      this.ws.cancelResponse();
      this.audioPlayer.stop();
      this.audioPlayer.clear();
      this.isAISpeaking = false;
    }

    this.callState.transition(CALL_STATES.USER_SPEAKING, { reason: "speech_started" });
  }

  _handleSpeechStop() {
    if (!this.isRecording) {
      return;
    }

    if (this.callState.state === CALL_STATES.USER_SPEAKING) {
      this.callState.transition(CALL_STATES.PROCESSING, { reason: "speech_stopped" });
    }
  }

  _handlePlaybackStarted() {
    this.isAISpeaking = true;

    if (this.isRecording) {
      this.callState.transition(CALL_STATES.AI_SPEAKING, { reason: "playback_started" });
    }
  }

  _handlePlaybackEnded() {
    this.isAISpeaking = false;

    if (this.isRecording && this.callState.state !== CALL_STATES.USER_SPEAKING) {
      this.callState.transition(CALL_STATES.READY, { reason: "playback_ended" });
    }
  }

  _handleCallStateChanged({ to }) {
    this.voiceUI.setCallState(to);
    this.voiceUI.setCallActive(this.callRequested || to !== CALL_STATES.IDLE);

    if (this.mode !== UI_MODE.VOICE) {
      return;
    }

    if (this.ws.status === STATUS.CONNECTED) {
      const label = STATUS_TEXT_IN_CALL[to] || "Connected";
      this.ui.updateStatus(STATUS.CONNECTED, label);
      return;
    }

    if (to === CALL_STATES.CONNECTING) {
      this.ui.updateStatus(STATUS.CONNECTING, "Connecting...");
      return;
    }

    if (to === CALL_STATES.ERROR) {
      this.ui.updateStatus(STATUS.ERROR, "Connection error");
      return;
    }

    if (to === CALL_STATES.IDLE) {
      this.ui.updateStatus(STATUS.DISCONNECTED, "Disconnected");
    }
  }

  switchMode(newMode) {
    if (newMode !== UI_MODE.TEXT && newMode !== UI_MODE.VOICE) {
      return;
    }

    if (this.mode === UI_MODE.VOICE && newMode === UI_MODE.TEXT && this.callRequested) {
      this._endVoiceCall();
    }

    this.mode = newMode;
    this.voiceUI.setMode(newMode);
    this.ui.clearInput();

    if (newMode === UI_MODE.TEXT) {
      if (this.ws.status === STATUS.CONNECTED) {
        this.ui.enableInput();
      } else {
        this.ui.disableInput();
      }
      return;
    }

    this.ui.disableInput();
    this.voiceUI.setCallState(this.callState.state);
    this.voiceUI.setCallActive(this.callRequested || this.callState.state !== CALL_STATES.IDLE);
  }

  _sendMessage() {
    if (this.mode !== UI_MODE.TEXT) {
      return;
    }

    const text = this.ui.getInputValue().trim();
    if (!text) {
      return;
    }

    this.ui.addMessage(text, "user");
    this.ui.clearInput();
    this.ui.resetAIMessage();

    const success = this.ws.sendUserText(text);
    if (!success) {
      this.ui.addMessage("Send failed: connection not ready", "error");
    }
  }

  _updateConnectionButtons(status, connectBtn, disconnectBtn) {
    if (connectBtn) {
      connectBtn.disabled = status === STATUS.CONNECTING || status === STATUS.CONNECTED;
    }
    if (disconnectBtn) {
      disconnectBtn.disabled = status === STATUS.DISCONNECTED;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new App();
});
