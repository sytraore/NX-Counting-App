// Shared helpers for the cached Gemini TTS endpoint (POST /speak).
//
//  - PRELOAD_PHRASES: the exact strings the frontend sends to /speak, so the
//    warm cache matches real requests (no phantom entries, no misses on typos).
//  - normalizeKey / numberToWord: make the cache key stable across whitespace
//    and digit-vs-word differences.
//  - acquireTtsSlot: one shared sliding-window rate limiter for every Gemini TTS
//    call (preload + on-demand misses share the same budget).
//  - ttsMetrics: latency + hit-rate instrumentation, surfaced at GET /speak/stats.

// The Gemini free tier allows 10 requests/minute for gemini-2.5-flash-*-tts.
// We pace evenly and stay one below the cap; override with GEMINI_TTS_RPM.
const RPM = Math.max(1, Number(process.env.GEMINI_TTS_RPM) || 9);
const WINDOW_MS = 60_000;
const MIN_SPACING_MS = Math.ceil(WINDOW_MS / RPM); // even pacing between calls
const SAFETY_MS = 500;

// Prompt prefix. Must be identical for preload and on-demand synthesis, otherwise
// a cache hit would return audio generated from a different prompt than a miss.
export const TTS_PROMPT_PREFIX =
  'Read in a calm and soothing tone to a class of preschoolers: ';

// ---------------------------------------------------------------------------
// Cache key normalization
// ---------------------------------------------------------------------------

// The frontend occasionally sends leading/trailing or doubled spaces
// (e.g. " Cookie Monster has 2 cookies..."). Collapse whitespace so those
// still hit the cache. Applied both when caching and when looking up.
export function normalizeKey(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

const NUMBER_WORDS = {
  '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
  '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
};

// gamepage.jsx sends counts as bare digits (`${newCount}`); Gemini TTS refuses
// to speak a lone digit, so map "1".."10" to words. Anything else passes through.
export function numberToWord(input) {
  const key = String(input).trim();
  return NUMBER_WORDS[key] || String(input);
}

// ---------------------------------------------------------------------------
// Canonical preload list
// ---------------------------------------------------------------------------
//
// Every entry is a string the study flow POSTs to /speak. Both textToSpeech()
// and textToSpeech2() now hit /speak — it is the only TTS endpoint. Keep this
// in sync when the frontend copy or the *Data.js message fields change.
//
// COUNTING GAME  pages/gamepage.jsx, components/circleDraw.jsx (deck: data/data.js, counts 5 & 10)
//   :99   textToSpeech2  `Cookie Monster has ${n} cookies. Let's count together!`
//   :283  textToSpeech2  `${newCount}`  -> numberToWord -> "one".."ten"
//   :254  textToSpeech2  "Green is correct, Good job!"
//   :257  textToSpeech2  "Purple is correct, Well done!"
//   :261  textToSpeech2  `No, ${trayType} has ${green.biscuits.length} cookies. Try again!`   (green tray = 10)
//   :265  textToSpeech2  `Wrong answer, ${trayType} has ${purple.biscuits.length} cookies. Try again!`  (purple tray = 5)
//   :289  textToSpeech2  "Great job! Now draw a circle with your finger by following the yellow line."
//   :86   textToSpeech   `Can Big Bird also have ${n} cookies? Which tray has ${n} cookies? Green? or Purple?`
//   circleDraw.jsx:130   textToSpeech2  "Please draw a circle"
//
// TRAINING FLOW  read verbatim from the *Data.js message fields:
//   pages/training.jsx           <- data/trainData.js .message[0]            (story pages 1-7 + combined count lines, counts 1/2/5/10)
//   pages/basePage(2).jsx        <- data/baseData.js .message               (combined count lines, counts 5/10)
//   pages/baseTraining(2).jsx    <- data/sectionTrainingData.js .message    (combined count lines, counts 1/2)
//   pages/TouchTrainingPage.jsx  <- data/sectionTrainingData.js .message1 / .message2 + the "Great job!" line
//   pages/animationTrainingPage.jsx  <- data/sectionTrainingData.js .message1 / .message2
//   pages/animationpage.jsx      <- inline, deck data/animationData.js (counts 5 & 10)
//
// NOT preloaded: pages/trainPage.jsx (/game/train-custom) — data is generated
// at runtime by helpers/trainingGenerator.js from a user-chosen range with
// singular/plural handling, so the phrases are not knowable ahead of time.

// Counts spoken by the fixed decks: the game and animation decks use 5 & 10,
// the training decks (trainData.js / sectionTrainingData.js) also use 1 & 2.
const TRAINING_COUNTS = [1, 2, 5, 10];

const cookieWord = (n) => (n === 1 ? 'cookie' : 'cookies');

// "Cookie Monster has N cookie(s). Let's count together!"  (game :99, training .message1)
const countTogether = (n) =>
  `Cookie Monster has ${n} ${cookieWord(n)}. Let's count together!`;

// "Can Big Bird also have N cookie(s)? Which tray has N cookie(s)? Green? or Purple?"
//   (game :86, animation, training .message2)
const bigBirdPrompt = (n) =>
  `Can Big Bird also have ${n} ${cookieWord(n)}? ` +
  `Which tray has ${n} ${cookieWord(n)}? Green? or Purple?`;

// The combined line the base/training pages read from .message
//   (data/trainData.js, baseData.js, sectionTrainingData.js)
const combinedPrompt = (n) =>
  `Cookie Monster has ${n} ${cookieWord(n)}. ${bigBirdPrompt(n)}`;

// trainData.js story pages (1-7), spoken verbatim by pages/training.jsx.
const STORY_LINES = [
  "Do you know who this is? That's right! It's Cookie Monster! What color is Cookie Monster? Blue! And here is Cookie Monster's blue tray.",
  'He has some cookies. Some cookies have chocolate chips on them. Some are plain. Some are big. And some are small.',
  "And this is Big Bird and his trays. What's the color of the left tray? Green! And what's the color of the right tray? Purple! Great job!",
  'Now, you might not know this but Big Bird is a HUGE copycat and always wants to copy Cookie Monster. When Cookie Monster was looking for a snack, Big Bird saw Cookie Monster pick chocolate chip cookies.',
  'So then when Big Bird chose his snack, he copied Cookie Monster and also picked chocolate chip cookies.',
  'Now look! Cookie Monster has a chocolate cookie. Which of these trays also has a chocolate cookie? Green? or Purple?',
  'Remember, Big Bird always puts his cookies in one of these trays, either the green or the purple tray.',
];

export const PRELOAD_PHRASES = dedupe([
  // spoken numbers (gamepage `${newCount}` -> numberToWord)
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',

  // count-driven lines
  ...TRAINING_COUNTS.map(countTogether),
  ...TRAINING_COUNTS.map(bigBirdPrompt),
  ...TRAINING_COUNTS.map(combinedPrompt),

  // game feedback / instructions
  'Green is correct, Good job!',
  'Purple is correct, Well done!',
  'Great job! Now draw a circle with your finger by following the yellow line.',
  'Please draw a circle',
  'No, greenTray has 10 cookies. Try again!',
  'Wrong answer, purpleTray has 5 cookies. Try again!',

  // training story pages
  ...STORY_LINES,
].map(normalizeKey));

function dedupe(list) {
  // Array.from, not [...set]: the build (SWC) compiles spread-of-Set to
  // [].concat(set), which wraps the Set instead of expanding it.
  return Array.from(new Set(list));
}

// ---------------------------------------------------------------------------
// Shared sliding-window rate limiter
// ---------------------------------------------------------------------------

let callTimestamps = [];
let queue = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForSlot() {
  for (;;) {
    const now = Date.now();
    callTimestamps = callTimestamps.filter((t) => now - t < WINDOW_MS);

    const last = callTimestamps[callTimestamps.length - 1];
    if (last !== undefined && now - last < MIN_SPACING_MS) {
      await sleep(MIN_SPACING_MS - (now - last));
      continue;
    }

    if (callTimestamps.length < RPM) {
      callTimestamps.push(Date.now());
      return;
    }

    const waitMs = WINDOW_MS - (now - callTimestamps[0]) + SAFETY_MS;
    await sleep(waitMs);
  }
}

// Acquire one Gemini TTS request slot. Serializes all callers so preload and
// /speak misses never race past the limit. Resolves with the ms spent waiting.
export function acquireTtsSlot() {
  const started = Date.now();
  const run = queue.then(() => waitForSlot());
  queue = run.catch(() => undefined);
  return run.then(() => Date.now() - started);
}

export function rateLimiterState() {
  const now = Date.now();
  return {
    rpm: RPM,
    minSpacingMs: MIN_SPACING_MS,
    callsInWindow: callTimestamps.filter((t) => now - t < WINDOW_MS).length,
  };
}

// ---------------------------------------------------------------------------
// Latency + hit-rate metrics
// ---------------------------------------------------------------------------

const MAX_SAMPLES = 500;
const samples = {
  cacheHitServeMs: [],
  cacheMissTotalMs: [],
  geminiApiCallMs: [],
  rateLimiterWaitMs: [],
};
const counters = { hits: 0, misses: 0, apiErrors: 0 };

function record(bucket, value) {
  const arr = samples[bucket];
  if (!arr) return;
  arr.push(value);
  if (arr.length > MAX_SAMPLES) arr.shift();
}

function summarize(arr) {
  if (!arr.length) return { count: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const pct = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    p50: Math.round(pct(50)),
    p95: Math.round(pct(95)),
    p99: Math.round(pct(99)),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
  };
}

export const ttsMetrics = {
  recordHit: (serveMs) => {
    counters.hits++;
    record('cacheHitServeMs', serveMs);
  },
  recordMiss: (totalMs) => {
    counters.misses++;
    record('cacheMissTotalMs', totalMs);
  },
  recordApiCall: (ms) => record('geminiApiCallMs', ms),
  recordLimiterWait: (ms) => record('rateLimiterWaitMs', ms),
  recordApiError: () => counters.apiErrors++,
  snapshot: () => {
    const total = counters.hits + counters.misses;
    return {
      hits: counters.hits,
      misses: counters.misses,
      total,
      hitRate: total ? Number((counters.hits / total).toFixed(4)) : 0,
      apiCallsSaved: counters.hits,
      apiErrors: counters.apiErrors,
      latencyMs: {
        cacheHitServe: summarize(samples.cacheHitServeMs),
        cacheMissTotal: summarize(samples.cacheMissTotalMs),
        geminiApiCall: summarize(samples.geminiApiCallMs),
        rateLimiterWait: summarize(samples.rateLimiterWaitMs),
      },
    };
  },
};
