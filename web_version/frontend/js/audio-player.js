const DEFAULT_CONFIG = Object.freeze({
  sampleRate: 24000,
  channels: 1,
  minStartChunks: 1,        // 减少到 1 个 chunk，降低启动延迟
  maxQueueLength: 200,
  startDelaySeconds: 0.01,  // 减少到 10ms，降低延迟
  scheduleAheadSeconds: 0.5, // 减少预调度时间
});

export class AudioPlayer {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.audioContext = null;
    this.queue = [];
    this.activeSources = new Set();

    this.isPlaying = false;
    this.hasStartedPlayback = false;
    this.scheduledTime = 0;

    this._playStartCallbacks = new Set();
    this._playEndCallbacks = new Set();
  }

  init() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ latencyHint: "interactive" });
    }
  }

  addChunk(int16Array) {
    if (!(int16Array instanceof Int16Array) || int16Array.length === 0) {
      return;
    }

    if (this.queue.length >= this.config.maxQueueLength) {
      this.queue.shift();
    }

    this.queue.push(int16Array);

    if (this.isPlaying) {
      this._scheduleFromQueue();
    }
  }

  start() {
    this.init();
    if (!this.audioContext) {
      return;
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    this.isPlaying = true;
    this._scheduleFromQueue();
  }

  stop() {
    this.isPlaying = false;
    this.scheduledTime = 0;

    // 先清理回调，防止竞态
    const sources = Array.from(this.activeSources);
    this.activeSources.clear();

    for (const source of sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }

    this.queue = [];

    if (this.hasStartedPlayback) {
      this.hasStartedPlayback = false;
      this._emitPlayEnd();
    }
  }

  clear() {
    this.queue = [];
  }

  onPlayStart(callback) {
    this._playStartCallbacks.add(callback);
    return () => this._playStartCallbacks.delete(callback);
  }

  onPlayEnd(callback) {
    this._playEndCallbacks.add(callback);
    return () => this._playEndCallbacks.delete(callback);
  }

  _scheduleFromQueue() {
    if (!this.audioContext || !this.isPlaying) {
      return;
    }

    if (!this.hasStartedPlayback && this.queue.length < this.config.minStartChunks) {
      return;
    }

    this.scheduledTime = this._getNextStartTime();

    while (this.queue.length > 0) {
      const ahead = this.scheduledTime - this.audioContext.currentTime;
      if (ahead > this.config.scheduleAheadSeconds) {
        break;
      }

      const chunk = this.queue.shift();
      if (!chunk) {
        break;
      }

      const source = this._createSourceFromChunk(chunk);
      if (!source) {
        continue;
      }

      const startAt = this._getNextStartTime();
      source.start(startAt);

      const duration = this._getChunkDurationSeconds(chunk.length);
      this.scheduledTime = startAt + duration;

      this.activeSources.add(source);
      source.onended = () => this._handleSourceEnded(source);

      if (!this.hasStartedPlayback) {
        this.hasStartedPlayback = true;
        this._emitPlayStart();
      }
    }
  }

  _createSourceFromChunk(int16Array) {
    if (!this.audioContext) {
      return null;
    }

    const float32 = this._int16ToFloat32(int16Array);

    const buffer = this.audioContext.createBuffer(
      this.config.channels,
      float32.length,
      this.config.sampleRate
    );
    buffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    return source;
  }

  _int16ToFloat32(int16Array) {
    const float32 = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i += 1) {
      float32[i] = int16Array[i] / 32768;
    }
    return float32;
  }

  _getChunkDurationSeconds(samples) {
    return samples / this.config.sampleRate;
  }

  _getNextStartTime() {
    if (!this.audioContext) {
      return 0;
    }

    const now = this.audioContext.currentTime;
    if (this.scheduledTime < now) {
      return now + this.config.startDelaySeconds;
    }
    return this.scheduledTime;
  }

  _handleSourceEnded(source) {
    if (this.activeSources.has(source)) {
      this.activeSources.delete(source);
    }
    source.disconnect();

    if (this.isPlaying) {
      this._scheduleFromQueue();
    }

    if (this.hasStartedPlayback && this.activeSources.size === 0 && this.queue.length === 0) {
      this.hasStartedPlayback = false;
      this._emitPlayEnd();
    }
  }

  _emitPlayStart() {
    for (const callback of this._playStartCallbacks) {
      callback();
    }
  }

  _emitPlayEnd() {
    for (const callback of this._playEndCallbacks) {
      callback();
    }
  }
}
