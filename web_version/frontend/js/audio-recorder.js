const DEFAULT_CONFIG = Object.freeze({
  sampleRate: 24000,
  chunkSize: 2400,
  workletUrl: "/js/audio-worklet-processor.js",
  volumeWindowSize: 6,
});

export class AudioRecorder {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.audioContext = null;
    this.stream = null;
    this.sourceNode = null;
    this.workletNode = null;

    this.isInitialized = false;
    this.isRecording = false;
    this.currentVolume = 0;
    this._volumeWindow = [];

    this._audioDataCallbacks = new Set();
    this._volumeCallbacks = new Set();
    this._errorCallbacks = new Set();
  }

  async init() {
    if (this.isInitialized) {
      return;
    }

    try {
      try {
        this.audioContext = new AudioContext({
          latencyHint: "interactive",
        });
      } catch (error) {
        throw this._createError("audio_context_create_failed", "Failed to create AudioContext", error);
      }

      try {
        await this.audioContext.audioWorklet.addModule(this.config.workletUrl);
      } catch (error) {
        throw this._createError("worklet_load_failed", "Failed to load AudioWorklet module", error);
      }

      this.workletNode = new AudioWorkletNode(this.audioContext, "audio-processor");
      this.workletNode.port.onmessage = (event) => {
        this._handleWorkletMessage(event.data);
      };

      this.isInitialized = true;
    } catch (error) {
      this._emitError(error);
      throw error;
    }
  }

  async requestPermission() {
    try {
      if (
        this.stream &&
        this.stream.getTracks().some((track) => track.readyState === "live")
      ) {
        return this.stream;
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      } catch (error) {
        if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
          throw this._createError(
            "microphone_permission_denied",
            "Microphone permission denied",
            error
          );
        }
        throw this._createError("microphone_access_failed", "Failed to access microphone", error);
      }
      return this.stream;
    } catch (error) {
      this._emitError(error);
      throw error;
    }
  }

  async start() {
    try {
      await this.init();
      await this.requestPermission();

      if (!this.audioContext || !this.workletNode || !this.stream) {
        throw new Error("AudioRecorder 未正确初始化");
      }

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      if (this.sourceNode) {
        this.sourceNode.disconnect();
      }
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      this.isRecording = true;
    } catch (error) {
      this._emitError(error);
      throw error;
    }
  }

  stop() {
    this.isRecording = false;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    this.currentVolume = 0;
    this._volumeWindow = [];
    this._emitVolume(0);
  }

  getVolume() {
    return this.currentVolume;
  }

  onAudioData(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this._audioDataCallbacks.add(callback);
    return () => this._audioDataCallbacks.delete(callback);
  }

  onVolumeChange(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this._volumeCallbacks.add(callback);
    return () => this._volumeCallbacks.delete(callback);
  }

  onError(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    this._errorCallbacks.add(callback);
    return () => this._errorCallbacks.delete(callback);
  }

  _handleWorkletMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "audio.volume") {
      const volume = this._smoothVolume(this._normalizeVolume(message.value));
      this.currentVolume = volume;
      this._emitVolume(volume);
      return;
    }

    if (message.type === "audio.pcm16.chunk") {
      if (typeof message.volume === "number") {
        const volume = this._smoothVolume(this._normalizeVolume(message.volume));
        this.currentVolume = volume;
        this._emitVolume(volume);
      }

      const arrayBuffer = message.data;
      if (!arrayBuffer) {
        return;
      }

      const pcm16 = new Int16Array(arrayBuffer);
      this._emitAudioData(pcm16);
    }
  }

  _normalizeVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 0;
    }
    if (n <= 0) {
      return 0;
    }
    if (n >= 1) {
      return 1;
    }
    return n;
  }

  _smoothVolume(value) {
    const size = Math.max(1, Number(this.config.volumeWindowSize) || 1);
    this._volumeWindow.push(value);
    if (this._volumeWindow.length > size) {
      this._volumeWindow.shift();
    }

    let total = 0;
    for (let i = 0; i < this._volumeWindow.length; i += 1) {
      total += this._volumeWindow[i];
    }
    return total / this._volumeWindow.length;
  }

  _createError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) {
      error.cause = cause;
    }
    return error;
  }

  _emitAudioData(pcm16) {
    for (const callback of this._audioDataCallbacks) {
      callback(pcm16);
    }
  }

  _emitVolume(volume) {
    for (const callback of this._volumeCallbacks) {
      callback(volume);
    }
  }

  _emitError(error) {
    for (const callback of this._errorCallbacks) {
      callback(error);
    }
  }
}
