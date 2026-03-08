import {
  AUDIO_CONFIG,
  MESSAGE_TYPES,
  PLAYER_CONFIG,
  REALTIME_CONFIG,
  STATUS,
  UI_MODE,
  VIDEO_CONFIG,
} from "./config.js";
import { AudioPlayer } from "./audio-player.js";
import { MediaRecorder } from "./media-recorder.js";
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

    this.mode = UI_MODE.VOICE;
    this.callRequested = false;
    this.isRealtimeReady = false;
    this.isRecording = false;
    this.isAISpeaking = false;
    this.hasAssistantTranscriptDelta = false;
    this._capturePromise = null;
    this._speechDebounceTimer = null;
    this._lastSpeechState = null;
    this._needEnableVideo = false;

    this.audioRecorder = new MediaRecorder({
      sampleRate: AUDIO_CONFIG.sampleRate,
      chunkSize: AUDIO_CONFIG.chunkSize,
      workletUrl: AUDIO_CONFIG.workletPath,
      volumeWindowSize: 6,
      videoConfig: VIDEO_CONFIG,
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

    this.switchMode(UI_MODE.VOICE);
    this._handleStatusChange(STATUS.DISCONNECTED);
    this.voiceUI.setCallState(CALL_STATES.IDLE);
  }

  _bindEvents() {
    const { connectBtn, disconnectBtn } = this.ui.elements;

    if (connectBtn) {
      connectBtn.addEventListener("click", () => this.ws.connect());
    }
    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => {
        this._endVoiceCall();
      });
    }

    this.voiceUI.bindModeHandlers(
      () => this.switchMode(UI_MODE.VOICE),
      () => this.switchMode(UI_MODE.VIDEO)
    );
    this.voiceUI.bindCallToggle(() => this.toggleVoiceCall());
    this.voiceUI.bindVideoCallToggle(() => this.toggleVideoCall());
    this.voiceUI.bindPreviewToggle(() => this.toggleVideoPreview());
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

    // 批量发送视频帧
    this.audioRecorder.onVideoBatch((frameBatch) => {
      if (this.mode === UI_MODE.VIDEO) {
        this.ws.sendVideoBatch(frameBatch);
      }
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
    this.ws.onVisualAnalysis((content) => this._handleVisualAnalysis(content));
  }

  async _initAudioModules() {
    try {
      this.audioPlayer.init();
      await this.audioRecorder.init();
    } catch (error) {
      console.error(`Audio init failed: ${error?.message || "unknown"}`);
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

  toggleVideoCall() {
    if (this.mode !== UI_MODE.VIDEO) {
      return;
    }

    if (this.callRequested || this.callState.state !== CALL_STATES.IDLE) {
      this._endVoiceCall();
    } else {
      this._startVideoCall();
    }
  }

  toggleVideoPreview() {
    const preview = document.getElementById("videoPreview");
    const btn = document.getElementById("togglePreviewBtn");
    if (!preview || !btn) return;

    if (preview.style.display === "none") {
      preview.style.display = "block";
      btn.textContent = "隐藏预览";
    } else {
      preview.style.display = "none";
      btn.textContent = "显示预览";
    }
  }

  async _startVideoCall() {
    console.log('[App] Starting video call...');
    this.callRequested = true;
    this.voiceUI.setVideoCallActive(true);
    this.voiceUI.setVideoCallButtonDisabled(true);
    this.callState.transition(CALL_STATES.CONNECTING, { reason: "user_start_video_call" });
    this.voiceUI.setVideoHint("正在申请麦克风和摄像头权限...");

    this.audioRecorder.isVideoEnabled = true;
    this._needEnableVideo = true;
    console.log('[App] Set _needEnableVideo = true');

    try {
      await this.audioRecorder.requestPermission();
    } catch (error) {
      const code = error?.code || "";
      let message = error?.message || "unknown";

      if (code === "media_permission_denied") {
        message = "麦克风或摄像头权限被拒绝。请在浏览器地址栏左侧的网站权限中允许访问。";
      } else if (code === "media_device_not_found") {
        message = "未找到麦克风或摄像头设备。请确认设备已连接并可被浏览器识别。";
      } else if (code === "media_device_busy") {
        message = "麦克风或摄像头正在被其他应用占用。请关闭占用设备的软件后重试。";
      } else if (code === "media_constraints_failed") {
        message = "当前摄像头不支持请求的视频参数，已改用兼容性更高的参数后仍失败。";
      } else if (code === "media_access_failed") {
        message = "无法访问麦克风或摄像头。请检查设备是否已连接、权限是否开启，或是否被其他应用占用。";
      }

      console.error(`视频通话启动失败: ${message}`);
      this.callRequested = false;
      this._needEnableVideo = false;
      this.audioRecorder.isVideoEnabled = false;
      this.callState.transition(CALL_STATES.ERROR, { reason: "video_permission_failed" });
      this.voiceUI.setVideoCallActive(false);
      this.voiceUI.setVideoCallButtonDisabled(false);
      this.voiceUI.setVideoHint("请先允许麦克风和摄像头权限，再开始视频通话。");
      return;
    }

    this.voiceUI.setVideoHint("连接成功后将自动开始监听和视频采集。");

    if (this.ws.status === STATUS.CONNECTED && this.isRealtimeReady) {
      this._beginContinuousCapture();
      return;
    }

    if (this.ws.status === STATUS.DISCONNECTED || this.ws.status === STATUS.ERROR) {
      this.ws.connect();
    }
  }

  _handleVisualAnalysis(content) {
    const visualContext = `[视觉信息] ${content}`;

    this.ws.sendMessage({
      type: MESSAGE_TYPES.CONVERSATION_ITEM_CREATE,
      item: {
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: visualContext,
          },
        ],
      },
    });

    this.voiceUI.updateVisualAnalysis(content);
    console.log("[Visual Analysis]", content);
  }

  _startVoiceCall() {
    this.callRequested = true;
    this.voiceUI.setCallActive(true);
    this.voiceUI.setCallButtonDisabled(true);  // 禁用按钮防止重复点击
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
    this.voiceUI.setVideoCallActive(false);
    this.voiceUI.setVoiceHint("点击开始后将自动持续监听，无需按住按钮。");
  }

  async _beginContinuousCapture() {
    // 使用 Promise 锁防止竞态条件
    if (this._capturePromise) {
      return this._capturePromise;
    }

    if (!this.callRequested || this.isRecording) {
      return;
    }
    if (this.ws.status !== STATUS.CONNECTED || !this.isRealtimeReady) {
      return;
    }

    this._capturePromise = (async () => {
      try {
        await this.audioRecorder.requestPermission();
        this.ws.clearAudioInput();
        await this.audioRecorder.start();

        this.isRecording = true;
        console.log('[App] Recording started, isRecording =', this.isRecording);
        this.voiceUI.setCallActive(true);
        this.voiceUI.setCallButtonDisabled(false);  // 启用按钮
        this.callState.transition(CALL_STATES.READY, { reason: "capture_started" });
        this.voiceUI.setVoiceHint("自动监听中，可直接开始说话。");
        console.log("Voice call started");

        // 视频模式下，权限阶段已经拿到音视频流，这里只初始化预览和帧采集
        if (this._needEnableVideo) {
          console.log("[App] Enabling video capture... _needEnableVideo =", this._needEnableVideo);
          console.log("[App] audioRecorder.isRecording =", this.audioRecorder.isRecording);
          await this.audioRecorder.enableVideo(VIDEO_CONFIG.enablePreview);
          console.log("[App] Video capture enabled");
          this._needEnableVideo = false;
        } else {
          console.log("[App] _needEnableVideo is false, skipping video");
        }
      } catch (error) {
        const code = error?.code || "";
        let message = error?.message || "unknown";

        // 改进错误提示的用户友好性
        if (code === "media_permission_denied") {
          message = "麦克风或摄像头权限被拒绝。请在浏览器设置中允许访问。";
        } else if (code === "media_access_failed") {
          message = "无法访问麦克风或摄像头。请检查设备是否已连接、权限是否开启，或是否被其他应用占用。";
        } else if (code === "microphone_permission_denied") {
          message = "麦克风权限被拒绝。请在浏览器设置中允许麦克风访问。";
        } else if (code === "microphone_access_failed") {
          message = "无法访问麦克风。请检查麦克风是否已连接并被其他应用占用。";
        }

        console.error(`通话启动失败: ${message}`);
        this.callState.transition(CALL_STATES.ERROR, { reason: "capture_start_failed" });
        this.callRequested = false;
        this.voiceUI.setCallActive(false);
        this.voiceUI.setCallButtonDisabled(false);  // 启用按钮
        this.ws.disconnect();
      } finally {
        this._capturePromise = null;
      }
    })();

    return this._capturePromise;
  }

  _stopContinuousCapture() {
    this._capturePromise = null;

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
      if (this.callRequested) {
        this.callState.transition(CALL_STATES.CONNECTING, { reason: "ws_connecting" });
      }
      return;
    }

    if (status === STATUS.CONNECTED) {
      this.ui.updateStatus(STATUS.CONNECTED, "Connected");
      return;
    }

    if (status === STATUS.ERROR) {
      this.ui.updateStatus(STATUS.ERROR, "Connection error");
      this.isRealtimeReady = false;
      this._stopContinuousCapture();
      this.callState.transition(CALL_STATES.ERROR, { reason: "ws_error" });
      return;
    }

    this.ui.updateStatus(STATUS.DISCONNECTED, "Disconnected");
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
      console.log(data.message || "Server connected");
      return;
    }

    if (type === MESSAGE_TYPES.REALTIME_CONNECTED) {
      this.isRealtimeReady = true;
      console.log(data.message || "Realtime API connected");
      this.ws.updateSession(REALTIME_CONFIG);
      if (this.callRequested) {
        this._beginContinuousCapture();
      }
      return;
    }

    if (type === MESSAGE_TYPES.SESSION_CREATED) {
      console.log("Session created");
      return;
    }

    if (type === MESSAGE_TYPES.RESPONSE_TEXT_DELTA) {
      // Text delta no longer displayed in UI
      return;
    }

    if (type === MESSAGE_TYPES.ERROR) {
      const message = data.error?.message || "Unknown error";
      console.error(`Error: ${message}`);
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
        console.log("[User]", payload.text);
      }
      return;
    }

    if (payload.kind !== "assistant") {
      return;
    }

    if (!payload.done) {
      if (payload.text) {
        this.hasAssistantTranscriptDelta = true;
      }
      return;
    }

    if (!this.hasAssistantTranscriptDelta && payload.text.trim()) {
      console.log("[AI]", payload.text);
    }
    this.hasAssistantTranscriptDelta = false;
  }

  _handleSpeechStart() {
    clearTimeout(this._speechDebounceTimer);
    this._lastSpeechState = 'started';

    this._speechDebounceTimer = setTimeout(() => {
      if (this._lastSpeechState !== 'started') return;

      if (!this.isRecording) {
        return;
      }

      // 如果 AI 正在说话，立即打断
      if (this.isAISpeaking || this.callState.state === CALL_STATES.AI_SPEAKING) {
        this.ws.cancelResponse();
        this.audioPlayer.stop();
        this.audioPlayer.clear();
        this.isAISpeaking = false;

        console.log("用户打断 AI 回复");
      }

      // 从任何状态转换到 USER_SPEAKING
      this.callState.transition(CALL_STATES.USER_SPEAKING, { reason: "speech_started" });
    }, 50);  // 减少到 50ms，提高响应速度
  }

  _handleSpeechStop() {
    clearTimeout(this._speechDebounceTimer);
    this._lastSpeechState = 'stopped';

    this._speechDebounceTimer = setTimeout(() => {
      if (this._lastSpeechState !== 'stopped') return;
      if (!this.isRecording) return;

      if (this.callState.state === CALL_STATES.USER_SPEAKING) {
        this.callState.transition(CALL_STATES.PROCESSING, { reason: "speech_stopped" });
      }
    }, 100);  // 100ms 防抖
  }

  _handlePlaybackStarted() {
    this.isAISpeaking = true;

    // 如果用户正在说话，不要切换到 AI_SPEAKING 状态
    if (this.isRecording && this.callState.state !== CALL_STATES.USER_SPEAKING) {
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
    this.voiceUI.setCallActive(this.mode === UI_MODE.VOICE && (this.callRequested || to !== CALL_STATES.IDLE));
    this.voiceUI.setVideoCallActive(this.mode === UI_MODE.VIDEO && (this.callRequested || to !== CALL_STATES.IDLE));

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
    if (newMode !== UI_MODE.VOICE && newMode !== UI_MODE.VIDEO) {
      return;
    }

    if (this.callRequested) {
      this._endVoiceCall();
    }

    if (this.mode === UI_MODE.VIDEO && newMode !== UI_MODE.VIDEO) {
      this.audioRecorder.disableVideo();
    }

    this.mode = newMode;
    this.voiceUI.setMode(newMode);

    if (newMode === UI_MODE.VIDEO) {
      this.ws.connectGemini();
    }

    this.voiceUI.setCallState(this.callState.state);
    this.voiceUI.setCallActive(this.callRequested || this.callState.state !== CALL_STATES.IDLE);
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
