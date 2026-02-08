/**
 * Browser audio: capture mic at 16kHz mono PCM (for Gemini Live) and play 24kHz PCM (from Gemini).
 * Uses AudioContext + ScriptProcessorNode for capture (simplest); manual resample for playback.
 */

const SEND_SAMPLE_RATE = 16000;
const RECV_SAMPLE_RATE = 24000;
const CHUNK_MS = 100;
const SEND_FRAMES = (SEND_SAMPLE_RATE * CHUNK_MS) / 1000; // 1600 frames

let audioContext: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: SEND_SAMPLE_RATE });
  }
  return audioContext;
}

export async function startMicCapture(
  stream: MediaStream,
  onChunk: (pcmBase64: string) => void
): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  const input = ctx.createMediaStreamSource(stream);
  const bufferSize = 4096;
  const node = ctx.createScriptProcessor(bufferSize, 1, 1);
  let buffer: number[] = [];
  node.onaudioprocess = (ev) => {
    const inputData = ev.inputBuffer.getChannelData(0);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      buffer.push(s);
    }
    while (buffer.length >= SEND_FRAMES) {
      const chunk = buffer.splice(0, SEND_FRAMES);
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const v = Math.floor(chunk[i] * 32767);
        int16[i] = Math.max(-32768, Math.min(32767, v));
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
      onChunk(b64);
    }
  };
  input.connect(node);
  node.connect(ctx.destination);
  source = input;
  processor = node;
}

export function stopMicCapture(): void {
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (source) {
    source.disconnect();
    source = null;
  }
}

const playbackQueue: ArrayBuffer[] = [];
let playbackContext: AudioContext | null = null;
let nextPlayTime = 0;

export function playPcm24k(pcmBase64: string): void {
  const binary = atob(pcmBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  playbackQueue.push(bytes.buffer);
  drainPlayback();
}

function drainPlayback(): void {
  if (playbackQueue.length === 0) return;
  if (!playbackContext) {
    playbackContext = new AudioContext({ sampleRate: RECV_SAMPLE_RATE });
  }
  const ctx = playbackContext;
  if (ctx.state === 'suspended') {
    ctx.resume().then(drainPlayback);
    return;
  }
  const chunk = playbackQueue.shift()!;
  const int16 = new Int16Array(chunk);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  const buffer = ctx.createBuffer(1, float32.length, RECV_SAMPLE_RATE);
  buffer.copyToChannel(float32, 0);
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  const start = Math.max(nextPlayTime, ctx.currentTime);
  node.start(start);
  nextPlayTime = start + buffer.duration;
}

export function stopPlayback(): void {
  playbackQueue.length = 0;
  nextPlayTime = 0;
}
