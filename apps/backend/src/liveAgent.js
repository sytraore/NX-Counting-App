import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';

const LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025';

const COUNT_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

const updateCookieDeclaration = {
  name: 'updateCookie',
  description:
    'Call whenever the child clearly says a counting number (1-10). Pass the number they said. The app only accepts the next expected number.',
  parameters: {
    type: 'object',
    properties: {
      number: {
        type: 'integer',
        description: 'The counting number the child spoke (1-10).',
      },
    },
    required: ['number'],
  },
};

function buildSystemInstruction(targetCount) {
  return `You are a warm preschool counting tutor. The child counts cookies aloud from 1 to ${targetCount}.

WHEN TO SPEAK (one short utterance — say it once, then stop):
1. SESSION START: Say exactly "Cookie Monster has ${targetCount} cookies. Let's count together!"
2. CORRECT COUNT (after successful updateCookie, not the final number): ONE brief encouragement in your own words (under 6 words; vary phrasing).
3. WRONG COUNT (after failed updateCookie): ONE gentle correction. Tell them the next number they should say. Do NOT repeat or say back the wrong number they just spoke.
4. FINISHED: ONE brief celebration after they correctly say ${targetCount}.

WHEN TO STAY SILENT:
- While listening.
- After a correct count, do not say the number they just spoke (e.g. do not say "three" after they said three correctly).`;
}

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function extractAudioFromMessage(message) {
  if (message.data) {
    return [message.data];
  }
  const chunks = [];
  const parts = message.serverContent?.modelTurn?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        chunks.push(part.inlineData.data);
      }
    }
  }
  return chunks;
}

function wrongCountToolHint(expectedNumber) {
  const nextWord = COUNT_WORDS[expectedNumber - 1];
  return `Wrong number. Speak ONE short sentence asking for "${nextWord}" next. Do NOT repeat the number the child just said.`;
}

async function handleClientConnection(clientWs, ai) {
  let session = null;
  let targetCount = 5;
  let expectedNumber = 1;
  let sessionReady = false;
  /** @type {'silent' | 'intro' | 'encourage' | 'correction' | 'celebration'} */
  let speechMode = 'silent';
  let openedSpeechThisMessage = false;

  const closeSession = () => {
    if (session) {
      try {
        session.close();
      } catch {
        // ignore
      }
      session = null;
    }
    sessionReady = false;
    speechMode = 'silent';
  };

  const beginSpeechMode = (mode) => {
    if (speechMode !== 'silent') {
      sendJson(clientWs, { type: 'audioFlush' });
    }
    speechMode = mode;
    openedSpeechThisMessage = true;
  };

  const endSpeechMode = () => {
    speechMode = 'silent';
    sendJson(clientWs, { type: 'audioFlush' });
  };

  const forwardAudio = (message) => {
    if (speechMode === 'silent') {
      return;
    }
    for (const data of extractAudioFromMessage(message)) {
      sendJson(clientWs, { type: 'audio', data });
    }
  };

  const handleToolCall = (toolCall) => {
    if (!toolCall?.functionCalls?.length) {
      return;
    }

    const functionResponses = [];
    /** @type {'encourage' | 'correction' | 'celebration' | null} */
    let speechAfterTool = null;

    for (const fc of toolCall.functionCalls) {
      if (fc.name !== 'updateCookie') {
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: { success: false, reason: 'unknown_function' },
        });
        continue;
      }

      const spoken = Number(fc.args?.number);
      if (!Number.isFinite(spoken) || spoken < 1 || spoken > targetCount) {
        speechAfterTool = 'correction';
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: {
            success: false,
            expectedNumber,
            reason: 'invalid_number',
            speak: wrongCountToolHint(expectedNumber),
          },
        });
        continue;
      }

      if (spoken !== expectedNumber) {
        speechAfterTool = 'correction';
        functionResponses.push({
          id: fc.id,
          name: fc.name,
          response: {
            success: false,
            expectedNumber,
            spoken,
            reason: spoken > expectedNumber ? 'too_high' : 'too_low',
            speak: wrongCountToolHint(expectedNumber),
          },
        });
        continue;
      }

      sendJson(clientWs, {
        type: 'ui',
        action: 'highlightCookie',
        number: spoken,
      });

      const completed = spoken >= targetCount;
      if (!completed) {
        expectedNumber = spoken + 1;
        speechAfterTool = 'encourage';
      } else {
        speechAfterTool = 'celebration';
        sendJson(clientWs, { type: 'ui', action: 'countingComplete' });
      }

      functionResponses.push({
        id: fc.id,
        name: fc.name,
        response: {
          success: true,
          number: spoken,
          nextExpected: completed ? null : expectedNumber,
          completed,
          speak: completed
            ? 'Give ONE brief celebration in your own words.'
            : 'Give ONE brief encouragement in your own words. Do NOT repeat the number they just said.',
        },
      });
    }

    session.sendToolResponse({ functionResponses });

    if (speechAfterTool) {
      beginSpeechMode(speechAfterTool);
    }
  };

  const startGeminiSession = async () => {
    closeSession();
    sendJson(clientWs, { type: 'status', status: 'connecting' });

    session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemInstruction(targetCount),
        tools: [{ functionDeclarations: [updateCookieDeclaration] }],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' },
          },
        },
      },
      callbacks: {
        onmessage: (message) => {
          openedSpeechThisMessage = false;

          if (message.toolCall) {
            handleToolCall(message.toolCall);
          }

          const heardText = message.serverContent?.inputTranscription?.text;
          if (heardText) {
            sendJson(clientWs, {
              type: 'transcript',
              role: 'user',
              text: heardText,
            });
          }

          forwardAudio(message);

          if (message.serverContent?.turnComplete && !openedSpeechThisMessage) {
            endSpeechMode();
          }

          if (speechMode !== 'silent' && message.serverContent?.outputTranscription?.text) {
            sendJson(clientWs, {
              type: 'transcript',
              role: 'agent',
              text: message.serverContent.outputTranscription.text,
            });
          }
        },
        onerror: (e) => {
          console.error('Gemini Live error:', e);
          sendJson(clientWs, {
            type: 'error',
            message: e?.message || 'Gemini Live session error',
          });
        },
        onclose: (e) => {
          console.log('Gemini Live closed:', e?.reason || '');
          sessionReady = false;
          speechMode = 'silent';
          sendJson(clientWs, { type: 'status', status: 'disconnected' });
        },
      },
    });

    sessionReady = true;
    sendJson(clientWs, { type: 'status', status: 'connected', expectedNumber });

    beginSpeechMode('intro');
    session.sendClientContent({
      turns: `The child is ready. Say exactly: "Cookie Monster has ${targetCount} cookies. Let's count together!"`,
      turnComplete: true,
    });
  };

  clientWs.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'start') {
        targetCount = Math.min(10, Math.max(1, Number(msg.targetCount) || 5));
        expectedNumber = Math.min(
          targetCount,
          Math.max(1, Number(msg.expectedNumber) || 1)
        );
        await startGeminiSession();
        return;
      }

      if (msg.type === 'audio' && sessionReady && session && msg.data) {
        session.sendRealtimeInput({
          audio: {
            data: msg.data,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      }
    } catch (err) {
      console.error('Live agent message error:', err);
      sendJson(clientWs, {
        type: 'error',
        message: err?.message || 'Invalid message',
      });
    }
  });

  clientWs.on('close', () => {
    closeSession();
  });
}

export function attachLiveAgent(httpServer, apiKey) {
  if (!apiKey) {
    console.warn('GEMINI_API_KEY missing — Live agent WebSocket disabled');
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });
  const wss = new WebSocketServer({ server: httpServer, path: '/live' });

  wss.on('connection', (clientWs) => {
    handleClientConnection(clientWs, ai).catch((err) => {
      console.error('Live agent connection failed:', err);
      sendJson(clientWs, {
        type: 'error',
        message: err?.message || 'Failed to start voice agent',
      });
      clientWs.close();
    });
  });

  console.log(
    `Gemini Live agent listening on ws://localhost:${process.env.REACT_APP_PORT || 5000}/live`
  );
  return wss;
}
