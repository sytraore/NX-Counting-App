import { config } from 'dotenv';
import {connectToDb} from './db.js';
import express from 'express';
import './database/userDetails.js';
import './database/touchDetails.js';
import './database/trainingTouchDetails.js';
import './database/practiceTouchDetails.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import fetch from 'node-fetch';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Writer } from 'wav';
import { PassThrough } from 'stream';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  TTS_PROMPT_PREFIX,
  normalizeKey,
  numberToWord,
  PRELOAD_PHRASES,
  acquireTtsSlot,
  rateLimiterState,
  ttsMetrics,
} from './ttsHelpers.js';

//import { config } from 'dotenv'; // might move it before importing the db.js file

// change from apps/backend/.env.local to .env.local to enable environment variables to be loaded on server
config({path:'.env.local'});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, '/data');
const PORT = process.env.REACT_APP_PORT || 5000;
console.log(PORT);

const GOOGLE_API_KEY = process.env.GOOGLEAPI_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const keyPath = process.env.KEYPATH;
const certPath = process.env.CERTPATH;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }))

const JWT_SECRET = process.env.JWT_SECRET;

const User = mongoose.model("UserInfo");
const UserTouchDetails = mongoose.model("TouchDetails");
const UserTrainingTouchDetails = mongoose.model("TrainingTouchDetails");
const UserPracticeTouchDetails = mongoose.model("PracticeTouchDetails");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });

app.post("/register", async (req, res) => {
    const { name } = req.body;
  
    try {
      await User.create({
        uname: name,
        answers: {
          baselineTrainingAnswers: null,
          baselineTraining2Answers: null,
          TouchTrainingAnswers: null,
          animationTrainingAnswers: null,
          touchTestAnswers: null,
          animationTestAnswers: null,
          baselineTestAnswers: null,
          baselineTest2Answers: null,
          practiceAnswers: null,
        },
      });

      console.log("user:", User.answers)
      const token = jwt.sign({name: name}, JWT_SECRET,{
        expiresIn: 86400,
      });
      res.send({ status: "ok", data: token });

    } catch (error) {
      res.send({ status: "error" });
    }
  });


  app.post("/userData", async (req, res) => {
    const { token } = req.body;
    try {
      const user = jwt.verify(token, JWT_SECRET, (err, res) => {
        if (err) {
          return err;
        }
        return res;
      });

      if (user == "TokenExpiredError: jwt expired") {
        return res.send({ status: "error", data: "token expired" });
      }
  
      const username = user.name;
      const data = await User.findOne({ uname: username });
    
      if (data) {
        res.send({ status: "ok", data: data });
      } else {
        res.send({ status: "error", data: "User not found" });
      }
    } catch (error) {
      console.error("Error :", error);
     }
  });


  // app.post("/update-answer/:questionNumber", async (req, res) => {
  //   const { questionNumber } = req.params;
  //   const { token, newAnswer } = req.body;
  //   const correctAnswers = ["greenTray","purpleTray","greenTray","purpleTray"];
  //   let score = 0;
  
  //   try {
  //     const user = jwt.verify(token, JWT_SECRET);
  //     const username = user.name;

  //     if (newAnswer === correctAnswers[questionNumber]) {
  //       score = 1;
  //     }else{
  //       score = 0;
  //     }

  //     const updatedUser = await User.findOneAndUpdate(
  //       { uname :username },
  //       { [`answer${questionNumber}`]: score },
  //     );
  
  //     res.json(updatedUser);
  //   } catch (error) {
  //     res.status(500).json({ error: "Error updating answer." });
  //   }
  // });

  app.post('/submit/answers', async (req, res) => {
    try{
      const { answers, pageType }= req.body;
      const token = req.headers.authorization.split('Bearer ')[1];

      const user = jwt.verify(token, JWT_SECRET);
      const username = user.name;

      const updateField = {};
      updateField[`answers.${pageType}`] = answers;
  
      const updatedUser = await User.findOneAndUpdate(
        { uname: username },
        { $set: updateField },
        { new: true }
      );

      res.json(updatedUser);

    }catch (error) {
      res.status(500).json({ error: "Error saving answer." });
    }
  });

  app.post('/save/Touch/Data', async (req, res) => {
    const { touchData, category, pageNumber } = req.body;

    try {
      await UserTouchDetails.create({
        touchData: touchData,
        category: category,
        pageNumber: pageNumber,
      });

      console.log('Touch data saved to the database.');
      res.status(200).json({ status: 'ok', message: 'Data saved successfully' });
    } catch (error) {
      console.error('Error saving training touch data:', error);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  });


  app.post('/save/Training/TouchData', async (req, res) => {
    const { touchData, category, pageNumber } = req.body;

    try {
      await UserTrainingTouchDetails.create({
        touchData: touchData,
        category: category,
        pageNumber: pageNumber,
      });

      console.log('Training touch data saved to the database.');
      res.status(200).json({ status: 'ok', message: 'Data saved successfully' });
    } catch (error) {
      console.error('Error saving training touch data:', error);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  });

  app.post('/save/Practice/TouchData', async (req, res) => {
    const { touchData, category, pageNumber } = req.body;

    try {
      await UserPracticeTouchDetails.create({
        touchData: touchData,
        category: category,
        pageNumber: pageNumber,
      });

      console.log('Practice touch data saved to the database.');
      res.status(200).json({ status: 'ok', message: 'Data saved successfully' });
    } catch (error) {
      console.error('Error saving training touch data:', error);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  });

  
  // app.post('/savePracticeTouchData', (req, res) => {
  //   try {
  //     console.log('Received request with body:', req.body);
  //     const { touchData } = req.body; 
  //     console.log('Parsed touch data:', touchData);
  
  //     fs.writeFileSync(`${dataPath}/PracticeTouchData.txt`, JSON.stringify(touchData));
  
  //     res.status(200).send('Touch data saved successfully.');
  //   } catch (error) {
  //     console.error('Error saving touch data:', error);
  //     res.status(500).send('Error saving touch data.');
  //   }
  // });


// In-memory TTS cache: normalized phrase -> raw PCM audio Buffer.
const cache = new Map();

// Synthesize one phrase with Gemini, going through the shared rate limiter.
// Records API + limiter latency. Resolves with the raw PCM Buffer, throws on
// a missing/empty audio payload so callers can decide what to do.
const synthesizeSpeech = async (text) => {
  const limiterWaitMs = await acquireTtsSlot();
  ttsMetrics.recordLimiterWait(limiterWaitMs);

  const apiStart = Date.now();
  const response = await model.generateContent({
    contents: [{ parts: [{ text: TTS_PROMPT_PREFIX + text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } },
      },
    },
  });
  ttsMetrics.recordApiCall(Date.now() - apiStart);

  const result = response.response;
  const base64Data = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Data) {
    const finishReason = result.candidates?.[0]?.finishReason || 'unknown';
    throw new Error(`Gemini returned no audio (finishReason: ${finishReason})`);
  }

  const audioBuffer = Buffer.from(base64Data, 'base64');
  if (!audioBuffer.length) {
    throw new Error('Gemini returned an empty audio buffer');
  }
  return audioBuffer;
};

// Wrap raw PCM in a WAV container and stream it to the client.
const streamWav = (res, audioBuffer) => {
  res.setHeader('Content-Type', 'audio/wav');
  const passthrough = new PassThrough();
  const wavWriter = new Writer({ sampleRate: 24000, bitDepth: 16, channels: 1 });
  passthrough.pipe(wavWriter).pipe(res);
  passthrough.end(audioBuffer);
};

// Warm the cache with the exact phrases the frontend sends to /speak.
// Sequential and rate-limited (see GEMINI_TTS_RPM), so this takes roughly
// PRELOAD_PHRASES.length / rpm minutes on a cold start.
const preloadTtsCache = async () => {
  const startTime = Date.now();
  const { rpm } = rateLimiterState();
  console.log(
    `Starting TTS cache preload: ${PRELOAD_PHRASES.length} phrases at ~${rpm}/min...`
  );

  let cached = 0;
  let failed = 0;

  for (const phrase of PRELOAD_PHRASES) {
    const key = normalizeKey(phrase);
    if (cache.has(key)) {
      cached++;
      continue;
    }
    try {
      cache.set(key, await synthesizeSpeech(key));
      cached++;
      console.log(`✅ Cached "${key}"`);
    } catch (error) {
      failed++;
      ttsMetrics.recordApiError();
      console.log(`❌ Failed to cache "${key}": ${error.message}`);
    }
  }

  console.log(
    `🎯 TTS preload done in ${Math.round((Date.now() - startTime) / 1000)}s ` +
      `(cached ${cached}/${PRELOAD_PHRASES.length}, failed ${failed}). ` +
      `Latency + hit rate at GET /speak/stats`
  );
};

// Cached Gemini TTS endpoint.
app.post('/speak', async (req, res) => {
  if (!req.body.text) {
    return res.status(400).send('No text provided!');
  }

  const requestStart = Date.now();
  const key = normalizeKey(numberToWord(String(req.body.text)));

  if (cache.has(key)) {
    console.log(`🎯 Cache HIT: "${key}"`);
    res.on('finish', () => ttsMetrics.recordHit(Date.now() - requestStart));
    return streamWav(res, cache.get(key));
  }

  console.log(`❌ Cache MISS: "${key}"`);
  try {
    const audioBuffer = await synthesizeSpeech(key);
    cache.set(key, audioBuffer);
    res.on('finish', () => ttsMetrics.recordMiss(Date.now() - requestStart));
    streamWav(res, audioBuffer);
  } catch (error) {
    ttsMetrics.recordApiError();
    console.error('TTS Error:', error.message);
    res.status(500).send('Error generating speech');
  }
});

// TTS cache + latency metrics (hit rate, cache-hit vs cache-miss vs API vs
// rate-limiter-wait latency percentiles, current limiter usage, cached keys).
app.get('/speak/stats', (req, res) => {
  res.json({
    ...ttsMetrics.snapshot(),
    rateLimiter: rateLimiterState(),
    cache: { size: cache.size, keys: Array.from(cache.keys()) },
  });
});


// Serve static files from the React app (after all API routes)
// use process.cwd() to get the current working directory
// this allows the server to serve the React app from the correct directory instead of the local directory
app.use(express.static(process.cwd()));

// Handle React routing, return all requests to React app
// same concept as above, use process.cwd() to get the current working directory
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

connectToDb()
  .then(() => {
    console.log("Successfully Connected to DB");

    app.listen(PORT, () => {
      console.log("Server listening on port " + PORT);
      // Warm the TTS cache after the server is accepting requests so a slow
      // cold preload never delays startup. Runs in the background.
      preloadTtsCache().catch((error) => {
        console.error('TTS preload failed:', error);
      });
    });
  })
  .catch((error) => {
    console.error("Error connecting to DB:", error);
  });

