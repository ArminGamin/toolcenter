import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

export const ONE_SHOT_VIDEO_DURATION_SEC = 7
export const ONE_SHOT_VIDEO_MAX_BYTES = Math.floor(9.5 * 1024 * 1024)
export const ONE_SHOT_VIDEO_FPS = 15
export const ONE_SHOT_VIDEO_BITRATE = 1_200_000

export function oneShotVideoFrameCount(): number {
  return ONE_SHOT_VIDEO_DURATION_SEC * ONE_SHOT_VIDEO_FPS
}

export function oneShotVideoFrameDurationUs(): number {
  return Math.round(1_000_000 / ONE_SHOT_VIDEO_FPS)
}

function even(n: number): number {
  return n % 2 === 0 ? n : n + 1
}

export function videoExtForMime(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm'
}

export function pickVideoMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/mp4'
  const candidates = [
    'video/mp4;codecs=avc1.42001E',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return 'video/webm'
}

function assertSize(blob: Blob): Blob {
  if (blob.size > ONE_SHOT_VIDEO_MAX_BYTES) {
    throw new Error('Encoded video exceeds 9.5MB')
  }
  return blob
}

async function waitForEncoderDrain(encoder: VideoEncoder): Promise<void> {
  while (encoder.encodeQueueSize > 2) {
    await new Promise<void>((resolve) => {
      encoder.addEventListener('dequeue', () => resolve(), { once: true })
    })
  }
}

async function canvasToStaticVideoBlobWebCodecs(canvas: HTMLCanvasElement): Promise<Blob> {
  const width = even(canvas.width)
  const height = even(canvas.height)
  const frameDurUs = oneShotVideoFrameDurationUs()
  const frameCount = oneShotVideoFrameCount()
  const configs: VideoEncoderConfig[] = [
    {
      codec: 'avc1.42001E',
      width,
      height,
      bitrate: ONE_SHOT_VIDEO_BITRATE,
      framerate: ONE_SHOT_VIDEO_FPS,
      avc: { format: 'avc' },
    },
    {
      codec: 'avc1.42E01E',
      width,
      height,
      bitrate: ONE_SHOT_VIDEO_BITRATE,
      framerate: ONE_SHOT_VIDEO_FPS,
    },
  ]
  let chosen: VideoEncoderConfig | null = null
  for (const candidate of configs) {
    const support = await VideoEncoder.isConfigSupported(candidate)
    if (support.supported) {
      chosen = (support.config as VideoEncoderConfig) || candidate
      break
    }
  }
  if (!chosen) throw new Error('WebCodecs H.264 not supported')

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: ONE_SHOT_VIDEO_FPS },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })

  let encodeError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      const timestamp = Number.isFinite(chunk.timestamp) ? chunk.timestamp : 0
      muxer.addVideoChunkRaw(data, chunk.type, timestamp, frameDurUs, meta)
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err))
    },
  })
  encoder.configure(chosen)

  const bitmap = await createImageBitmap(canvas)
  for (let i = 0; i < frameCount; i++) {
    if (encodeError) throw encodeError
    const timestamp = i * frameDurUs
    const frame = new VideoFrame(bitmap, { timestamp, duration: frameDurUs })
    encoder.encode(frame, { keyFrame: i === 0 || i % ONE_SHOT_VIDEO_FPS === 0 })
    frame.close()
    await waitForEncoderDrain(encoder)
  }
  bitmap.close()

  await encoder.flush()
  encoder.close()
  if (encodeError) throw encodeError
  muxer.finalize()
  return assertSize(new Blob([target.buffer], { type: 'video/mp4' }))
}

async function canvasToStaticVideoBlobMediaRecorder(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video export is not supported in this browser')
  }
  const mimeType = pickVideoMimeType()
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: ONE_SHOT_VIDEO_BITRATE,
  })

  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = []
    const cleanup = () => stream.getTracks().forEach((t) => t.stop())
    recorder.onerror = () => {
      cleanup()
      reject(new Error('Video encoding failed'))
    }
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      cleanup()
      if (!chunks.length) {
        reject(new Error('Video encoding produced no data'))
        return
      }
      try {
        const blob = assertSize(new Blob(chunks, { type: mimeType }))
        resolve(blob)
      } catch (err) {
        reject(err)
      }
    }

    recorder.start(200)
    const started = performance.now()
    const frameMs = 1000 / ONE_SHOT_VIDEO_FPS
    const tick = () => {
      try {
        track.requestFrame()
      } catch {
        /* some browsers only emit from captureStream fps */
      }
      if (performance.now() - started < ONE_SHOT_VIDEO_DURATION_SEC * 1000) {
        window.setTimeout(tick, frameMs)
      } else if (recorder.state === 'recording') {
        recorder.stop()
      }
    }
    tick()
  })
}

export async function canvasToStaticVideoBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
    try {
      return await canvasToStaticVideoBlobWebCodecs(canvas)
    } catch {
      /* fall back to MediaRecorder */
    }
  }
  return canvasToStaticVideoBlobMediaRecorder(canvas)
}
