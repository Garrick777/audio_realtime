import { AudioRecorder } from "./audio-recorder.js";

export class MediaRecorder extends AudioRecorder {
  constructor(config = {}) {
    super(config);

    this.videoConfig = config.videoConfig || {
      frameRate: 1,
      width: 640,
      height: 480,
      quality: 0.7,
      enablePreview: true,
      batchSize: 3,
      batchIntervalMs: 3000,
    };

    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
    this.frameInterval = null;
    this.batchInterval = null;
    this.isVideoEnabled = false;

    // 帧缓冲队列
    this.frameBuffer = [];

    this._videoFrameCallbacks = new Set();
    this._videoBatchCallbacks = new Set();
  }

  async requestPermission() {
    try {
      if (
        this.stream &&
        this.stream.getTracks().some((track) => track.readyState === "live")
      ) {
        return this.stream;
      }

      const constraints = {
        audio: true,
      };

      if (this.isVideoEnabled) {
        constraints.video = {
          width: { ideal: this.videoConfig.width },
          height: { ideal: this.videoConfig.height },
          frameRate: { ideal: Math.max(1, Math.ceil(this.videoConfig.frameRate * 6)) },
        };
      }

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        console.error("[MediaRecorder] getUserMedia failed", {
          name: error?.name,
          message: error?.message,
          constraint: error?.constraint,
          constraints,
        });
        if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
          throw this._createError(
            "media_permission_denied",
            "Camera/Microphone permission denied",
            error
          );
        }
        if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
          throw this._createError(
            "media_device_not_found",
            "Camera or microphone device not found",
            error
          );
        }
        if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
          throw this._createError(
            "media_device_busy",
            "Camera or microphone is already in use",
            error
          );
        }
        if (error?.name === "OverconstrainedError" || error?.name === "ConstraintNotSatisfiedError") {
          throw this._createError(
            "media_constraints_failed",
            "Requested camera constraints are not supported",
            error
          );
        }
        throw this._createError("media_access_failed", "Failed to access camera/microphone", error);
      }

      return this.stream;
    } catch (error) {
      this._emitError(error);
      throw error;
    }
  }

  async enableVideo(enablePreview = true) {
    console.log('[MediaRecorder] enableVideo called, isVideoEnabled:', this.isVideoEnabled);

    if (!this.isVideoEnabled) {
      this.isVideoEnabled = true;
      console.log('[MediaRecorder] Set isVideoEnabled = true');
    }

    console.log('[MediaRecorder] Calling _initVideoCapture...');
    this._initVideoCapture(enablePreview);
  }

  disableVideo() {
    if (!this.isVideoEnabled) {
      return;
    }

    this.isVideoEnabled = false;
    this._cleanupVideoCapture();

    if (this.isRecording) {
      this.stop();
      this.start();
    }
  }

  _initVideoCapture(enablePreview) {
    if (!this.stream) {
      console.warn("[MediaRecorder] No stream available for video capture");
      return;
    }

    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn("[MediaRecorder] No video track found");
      return;
    }

    // 创建或获取 video 元素
    if (enablePreview && this.videoConfig.enablePreview) {
      this.videoElement = document.getElementById("videoPreview");
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        console.log("[MediaRecorder] Video preview enabled");
      } else {
        console.warn("[MediaRecorder] Video preview element not found");
      }
    }

    // 如果没有预览元素，创建一个隐藏的 video 元素用于帧捕获
    if (!this.videoElement) {
      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = this.stream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.style.display = "none";
      document.body.appendChild(this.videoElement);
      console.log("[MediaRecorder] Created hidden video element for capture");
    }

    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.videoConfig.width;
      this.canvas.height = this.videoConfig.height;
      this.ctx = this.canvas.getContext("2d");
    }

    const intervalMs = 1000 / this.videoConfig.frameRate;
    this.frameInterval = setInterval(() => {
      this._captureFrame();
    }, intervalMs);

    // 启动批量发送定时器
    this.batchInterval = setInterval(() => {
      this._sendBatch();
    }, this.videoConfig.batchIntervalMs);

    console.log(`[MediaRecorder] Video capture started at ${this.videoConfig.frameRate} fps`);
    console.log(`[MediaRecorder] Batch sending every ${this.videoConfig.batchIntervalMs}ms with ${this.videoConfig.batchSize} frames`);
  }

  _cleanupVideoCapture() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }

    // 清空缓冲区
    this.frameBuffer = [];

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    if (this.canvas) {
      this.ctx = null;
      this.canvas = null;
    }
  }

  _captureFrame() {
    if (!this.isVideoEnabled || !this.ctx || !this.videoElement) {
      return;
    }

    // 确保 video 元素已经加载
    if (this.videoElement.readyState < 2) {
      console.log("[MediaRecorder] Video not ready yet, skipping frame");
      return;
    }

    try {
      this.ctx.drawImage(
        this.videoElement,
        0,
        0,
        this.videoConfig.width,
        this.videoConfig.height
      );

      this.canvas.toBlob(
        (blob) => {
          if (blob) {
            // 添加到缓冲区
            this.frameBuffer.push(blob);

            // 限制缓冲区大小，防止内存溢出
            const maxBufferSize = this.videoConfig.batchSize * 2;
            if (this.frameBuffer.length > maxBufferSize) {
              this.frameBuffer.shift();
            }

            console.log(`[MediaRecorder] Captured frame: ${blob.size} bytes, buffer: ${this.frameBuffer.length}/${this.videoConfig.batchSize}`);
          }
        },
        "image/jpeg",
        this.videoConfig.quality
      );
    } catch (error) {
      console.error("[MediaRecorder] Failed to capture video frame:", error);
    }
  }

  _sendBatch() {
    if (this.frameBuffer.length === 0) {
      console.log("[MediaRecorder] No frames in buffer, skipping batch");
      return;
    }

    // 取出指定数量的帧
    const batchSize = Math.min(this.videoConfig.batchSize, this.frameBuffer.length);
    const batch = this.frameBuffer.splice(0, batchSize);

    console.log(`[MediaRecorder] Sending batch of ${batch.length} frames`);

    // 触发批量回调
    this._emitVideoBatch(batch);
  }

  stop() {
    super.stop();
    this._cleanupVideoCapture();
  }

  onVideoFrame(callback) {
    this._videoFrameCallbacks.add(callback);
    return () => this._videoFrameCallbacks.delete(callback);
  }

  onVideoBatch(callback) {
    this._videoBatchCallbacks.add(callback);
    return () => this._videoBatchCallbacks.delete(callback);
  }

  _emitVideoFrame(blob) {
    for (const callback of this._videoFrameCallbacks) {
      callback(blob);
    }
  }

  _emitVideoBatch(batch) {
    for (const callback of this._videoBatchCallbacks) {
      callback(batch);
    }
  }
}
