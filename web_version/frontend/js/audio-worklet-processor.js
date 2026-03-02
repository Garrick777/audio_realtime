const TARGET_SAMPLE_RATE = 24000;
const TARGET_CHUNK_SAMPLES = 2400; // 100ms @ 24kHz

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._sourceSampleRate = sampleRate;
    this._resampleRatio = this._sourceSampleRate / TARGET_SAMPLE_RATE;
    this._resamplePosition = 0;

    this._inputBuffer = new Float32Array(0);
    this._pcmChunkBuffer = new Int16Array(TARGET_CHUNK_SAMPLES);
    this._pcmChunkOffset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) {
      return true;
    }

    const mono = this._mixToMono(input);
    if (mono.length === 0) {
      return true;
    }

    const rms = this._computeRms(mono);
    this.port.postMessage({
      type: "audio.volume",
      value: rms,
    });

    this._appendInput(mono);
    const resampled = this._resampleTo24k();
    if (resampled.length === 0) {
      return true;
    }

    const pcm16 = this._float32ToPcm16(resampled);
    this._appendPcmAndFlush(pcm16, rms);

    return true;
  }

  _mixToMono(channels) {
    if (channels.length === 1) {
      return channels[0];
    }

    const frames = channels[0].length;
    const mono = new Float32Array(frames);

    for (let i = 0; i < frames; i += 1) {
      let sum = 0;
      for (let ch = 0; ch < channels.length; ch += 1) {
        sum += channels[ch][i] || 0;
      }
      mono[i] = sum / channels.length;
    }

    return mono;
  }

  _appendInput(chunk) {
    const merged = new Float32Array(this._inputBuffer.length + chunk.length);
    merged.set(this._inputBuffer, 0);
    merged.set(chunk, this._inputBuffer.length);
    this._inputBuffer = merged;
  }

  _resampleTo24k() {
    if (this._inputBuffer.length < 2) {
      return new Float32Array(0);
    }

    const out = [];
    let t = this._resamplePosition;

    // Linear interpolation: y = x0 * (1 - frac) + x1 * frac
    while (t + 1 < this._inputBuffer.length) {
      const i0 = Math.floor(t);
      const frac = t - i0;
      const x0 = this._inputBuffer[i0];
      const x1 = this._inputBuffer[i0 + 1];
      out.push(x0 * (1 - frac) + x1 * frac);
      t += this._resampleRatio;
    }

    const consumed = Math.floor(t);
    if (consumed > 0) {
      this._inputBuffer = this._inputBuffer.slice(consumed);
      t -= consumed;
    }

    this._resamplePosition = t;
    return Float32Array.from(out);
  }

  _float32ToPcm16(float32) {
    const pcm16 = new Int16Array(float32.length);

    for (let i = 0; i < float32.length; i += 1) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      const v = Math.max(-32768, Math.min(32767, s * 32768));
      pcm16[i] = v;
    }

    return pcm16;
  }

  _computeRms(float32) {
    if (float32.length === 0) {
      return 0;
    }

    let sumSquares = 0;
    for (let i = 0; i < float32.length; i += 1) {
      const v = float32[i];
      sumSquares += v * v;
    }
    return Math.sqrt(sumSquares / float32.length);
  }

  _appendPcmAndFlush(pcm16, rms) {
    let readOffset = 0;

    while (readOffset < pcm16.length) {
      const writable = TARGET_CHUNK_SAMPLES - this._pcmChunkOffset;
      const copy = Math.min(writable, pcm16.length - readOffset);

      this._pcmChunkBuffer.set(
        pcm16.subarray(readOffset, readOffset + copy),
        this._pcmChunkOffset
      );
      this._pcmChunkOffset += copy;
      readOffset += copy;

      if (this._pcmChunkOffset === TARGET_CHUNK_SAMPLES) {
        const payload = this._pcmChunkBuffer.buffer;
        this.port.postMessage(
          {
            type: "audio.pcm16.chunk",
            sampleRate: TARGET_SAMPLE_RATE,
            volume: rms,
            data: payload,
          },
          [payload]
        );

        this._pcmChunkBuffer = new Int16Array(TARGET_CHUNK_SAMPLES);
        this._pcmChunkOffset = 0;
      }
    }
  }
}

registerProcessor("audio-processor", AudioProcessor);
