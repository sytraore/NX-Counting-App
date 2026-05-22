import { getPlaybackContext, stopAgentPlayback } from './liveAudio';

let correctionSource = null;

/** Unlock audio output during a user click (required on Safari/iOS). */
export async function unlockAudioOutput() {
  const ctx = getPlaybackContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  const silent = new Audio(
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
  );
  silent.volume = 0.01;
  try {
    await silent.play();
  } catch {
    // ignore
  }
}

export async function playCorrectionSpeech(text) {
  if (!text) {
    throw new Error('No correction text');
  }

  stopAgentPlayback();
  if (correctionSource) {
    try {
      correctionSource.stop();
    } catch {
      // ignore
    }
    correctionSource = null;
  }

  const response = await fetch('/speech/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Speech synthesis failed (${response.status})`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Speech synthesis returned empty audio');
  }

  const ctx = getPlaybackContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

  return new Promise((resolve, reject) => {
    const source = ctx.createBufferSource();
    correctionSource = source;
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (correctionSource === source) {
        correctionSource = null;
      }
      resolve();
    };
    try {
      source.start(0);
    } catch (err) {
      reject(err);
    }
  });
}
