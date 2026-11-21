export async function encodeMp4(canvas: HTMLCanvasElement, duration: number, draw: (fraction: number) => void, onProgress: (percent: number) => void, signal: AbortSignal): Promise<Blob> {
  if (!globalThis.VideoEncoder || !globalThis.VideoFrame) throw new Error("此浏览器不支持 MP4 编码，请使用最新版 Chrome 或 Edge。");
  if (!(duration > 0 && duration <= 120)) throw new Error("视频时长须在 0–120 秒之间，请提高视频倍速。");
  const config: VideoEncoderConfig = { codec: "avc1.42E01F", width: canvas.width, height: canvas.height, bitrate: 4_000_000, framerate: 30, avc: { format: "avc" } };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error("当前设备无法编码 H.264 MP4；请更换支持的 Chrome 或 Edge，PNG 导出仍可用。");
  signal.throwIfAborted();
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: canvas.width, height: canvas.height, frameRate: 30 }, fastStart: "in-memory" });
  let failure: Error | undefined;
  const encoder = new VideoEncoder({ output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (error) { failure = error as Error; } }, error: error => { failure = error; } });
  try {
    encoder.configure(config);
    const count = Math.max(2, Math.ceil(duration * 30));
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      if (failure) throw failure;
      draw(i / (count - 1));
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1_000_000 / 30), duration: Math.round(1_000_000 / 30) });
      try { encoder.encode(frame, { keyFrame: i % 60 === 0 }); } finally { frame.close(); }
      if (i % 15 === 14 || i === count - 1) {
        await encoder.flush();
        onProgress(Math.round((i + 1) / count * 100));
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    signal.throwIfAborted();
    if (failure) throw failure;
    muxer.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}
