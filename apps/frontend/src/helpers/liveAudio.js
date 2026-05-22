function resampleTo16k(float32, fromRate) {
  if (fromRate === 16000) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  const ratio = fromRate / 16000;
  const newLength = Math.floor(float32.length / ratio);
  const out = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, float32[idx]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function pcm16ToBase64(int16Array) {
  const bytes = new Uint8Array(
    int16Array.buffer,
    int16Array.byteOffset,
    int16Array.byteLength
  );
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

let playbackContext = null;
let nextStartTime = 0;
const activeSources = new Set();

export function getPlaybackContext() {
  if (!playbackContext) {
    playbackContext = new AudioContext({ sampleRate: 24000 });
  }
  return playbackContext;
}

export function resetPlaybackSchedule() {
  nextStartTime = 0;
}

export function stopAgentPlayback() {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // already stopped
    }
  }
  activeSources.clear();
  resetPlaybackSchedule();
}

export function playPcm24kBase64(base64) {
  if (!base64) return;

  const ctx = getPlaybackContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 2
  );
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }

  const buffer = ctx.createBuffer(1, float32.length, 24000);
  buffer.copyToChannel(float32, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  activeSources.add(source);
  source.onended = () => activeSources.delete(source);

  const now = ctx.currentTime;
  const start = Math.max(now, nextStartTime);
  source.start(start);
  nextStartTime = start + buffer.duration;
}

export async function startMicCapture(onPcmChunk) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const inputSampleRate = context.sampleRate;

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm16 = resampleTo16k(input, inputSampleRate);
    onPcmChunk(pcm16);
  };

  source.connect(processor);
  // Keep the processor graph alive without routing mic to speakers (avoids echo/double responses).
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      context.close();
    },
  };
}

export function closePlayback() {
  stopAgentPlayback();
  if (playbackContext) {
    playbackContext.close();
    playbackContext = null;
  }
}
