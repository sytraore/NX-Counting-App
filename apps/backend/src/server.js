import { config } from 'dotenv';
import {connectToDb} from './db.js';
import http from 'http';
import express from 'express';
import { attachLiveAgent } from './liveAgent.js';
import './database/userDetails.js';
import './database/touchDetails.js';
import './database/trainingTouchDetails.js';
import './database/practiceTouchDetails.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import fetch from 'node-fetch';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { Writer } from 'wav';
import { PassThrough } from 'stream';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
// Multer for handling audio uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

const JWT_SECRET = process.env.JWT_SECRET;

const User = mongoose.model("UserInfo");
const UserTouchDetails = mongoose.model("TouchDetails");
const UserTrainingTouchDetails = mongoose.model("TrainingTouchDetails");
const UserPracticeTouchDetails = mongoose.model("PracticeTouchDetails");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" }); // text to speech model
const model2 = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // speech to text model

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


// In-memory TTS cache
// const cache = new Map();
// let cacheStats = { hits: 0, misses: 0, total: 0 };

// // Generic function to save a text with its corresponding audio to the cache
// const saveToCache = async (items, itemType = 'items') => {
//   // start timer to track how long it takes to save the items to the cache
//   const startTime = Date.now();
//   console.log(`Starting saving ${itemType} into cache...`);

//   let successCount = 0; // track how many texts were successfully saved to the cache
//   let failureCount = 0; // track how many texts were not saved to the cache

//   for (let i = 0; i < items.length; i++) {
//     const item = items[i];
//     // make a request to the TTS API to generate the audio for the text
//     try {
//       const response = await model.generateContent({
//         contents: [{ parts: [{ text: "Read in a calm and soothing tone to a class of preschoolers: " + item }] }],
//         generationConfig: {
//           responseModalities: ['AUDIO'],
//           speechConfig: {
//             voiceConfig: {
//               prebuiltVoiceConfig: { voiceName: 'Leda' },
//             },
//           },
//         },
//       });

//       const result = response.response;
//       // get the audio data from the response
//       const data = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

//       // if the audio data is not found, increment the failure count and log the error
//       if (!data) {
//         failureCount++;
//         console.log(`❌ Failed to cache ${item} (no audio data)`);
//         continue;
//       }


//       const audioBuffer = Buffer.from(data, 'base64');
//       cache.set(item, audioBuffer);
//       successCount++;
//       console.log(`✅ Cached ${item}`);
//     } catch (error) {
//       failureCount++;
//       console.log(`❌ Failed to cache ${item}:`, error);
//     }

//     // Small delay between calls to reduce back-to-back failures on preview model
//     if (i < items.length - 1) {
//       await new Promise((resolve) => setTimeout(resolve, 2000));
//     }
//   }

//   const duration = Date.now() - startTime;
//   console.log(`🎯 Preload for ${itemType} completed in ${duration}ms (success: ${successCount}/${items.length}, failed: ${failureCount}/${items.length})`);
// };

// // Preload both arrays in parallel
// const preloadAll = async () => {
//   const startTime = Date.now();
//   console.log(' Starting TTS cache preload...');

//   const numbers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
//   const sentences = [
//     "Hello! Do you know who this is? That's right! It's Cookie Monster! What color is Cookie Monster? Blue! And here is Cookie Monster's blue tray.",
//     "Cookie Monster has 5 cookies. Let's count together!",
//     "Cookie Monster has 10 cookies. Let's count together!",
//     "Can Big Bird also have 5 cookies? Which tray has 5 cookies? Green or purple?",
//     "Purple is correct, Well done!",
//     "Green is correct, Well done!",
//     "Can Big Bird also have 10 cookies? Which tray has 10 cookies? Green or purple?",
//     "Great job! Now draw a circle with your finger by following the yellow line."
//   ];

//   //Preload sentences
//   saveToCache(sentences, 'sentences');
//   //wait for 4 seconds
//   await new Promise((resolve) => setTimeout(resolve, 4000));
//   // Preload numbers
//   saveToCache(numbers, 'numbers');
  

//   const endTime = Date.now();
//   const totalDuration = endTime - startTime;
//   console.log(`🎯 Preloading completed in ${totalDuration}ms`);
// };

// // preload all at server start
// //preloadAll();


// // convert a number to a word
// // return the input if it is not a number
// const numberToWord = (input) => {
//   const numberMap = {
//     '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
//     '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten'
//   };
  
//   return numberMap[input] || input;
// };


// // Gemini TTS API endpoint
// app.post('/speak', async(req, res) => {
//   if (!req.body.text) {
//     return res.status(400).send('No text provided!');
//   }

//   // Convert number to words because the request is a number in string format
//   // and the TTS API expects a word to work properly when reading a sequence of numbers
//   const inputText = numberToWord(String(req.body.text));
//   console.log('TTS Request received:', inputText);

//   // check the cache first
//   if (cache.has(inputText)) {
//     cacheStats.hits++; cacheStats.total++;
//     console.log(`🎯 Cache HIT for: ${inputText}`);
//     const cachedAudio = cache.get(inputText);
//     res.setHeader('Content-Type', 'audio/wav');
//     const passthrough = new PassThrough();
//     const wavWriter = new Writer({ sampleRate: 24000, bitDepth: 16, channels: 1 });
//     passthrough.pipe(wavWriter).pipe(res);
//     passthrough.end(cachedAudio);
//     return;
//   }

//   // request is not in the cache, call the TTS API
//   console.log(`❌ Cache MISS for: ${inputText}`);
//   cacheStats.misses++; cacheStats.total++;

//   try {
//     console.log('Calling Gemini TTS API...');
//     const response = await model.generateContent({
//       contents: [{parts: [{text: "Read in a calm and soothing tone: " + inputText}] }],
//       generationConfig: {
//         responseModalities: ['AUDIO'],
//         speechConfig: {
//           voiceConfig: {
//             prebuiltVoiceConfig: {voiceName: 'Leda'},
//           },
//         },
//       },
//     });

//     const result = response.response;

//     console.log('TTS API Response status:', response.status);

//     // the result is a base64 encoded string of the audio data
//     // a base64 encoded string is a string of characters that represent binary data in a format that can be easily stored and transmitted
//     const base64Data = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

//     if (!base64Data) {
//       console.log('Failed to find audio data in the response:', result);
//       return res.status(500).send('API did not return audio data.');
//     }

//     // Log the length of the audio data for debugging
//     //console.log('Audio data found, length:', data.length);

//     // Convert the base64 data to a buffer because Node.js streams and file systems work with buffers.
//     // and the wav Writer expects a raw PCM data
//     // a buffer is raw PCM data, therefore we need to convert the base64 data to a buffer
//     const audioBuffer = Buffer.from(base64Data, 'base64');

//     // save the audio buffer to the cache
//     cache.set(inputText, audioBuffer);

//     // we set the Content-Type to audio/wav by converting the audio data from raw binary data to a WAV file 
//     // because browsers expect a proper audio format with headers
//     res.setHeader('Content-Type', 'audio/wav');

//     // We create a PassThrough stream to pipe the data because the wav Writer expects a stream
//     // we can't just send the raw binary data directly, so we need to convert the buffer to a stream first
//     // by using a PassThrough which is a type of stream that passes data through without any transformation
//     // this allows us to pipe the raw binary data into the wav Writer
//     // which will add the necessary WAV headers to make it a proper WAV file
//     // and then pipe the resulting WAV file to the response
//     // so the client receives a proper WAV file
//     // This is a common pattern when dealing with audio data in Node.js
//     const passthrough = new PassThrough();

//     // Create a WAV writer that will add the header
//     const wavWriter = new Writer({
//       sampleRate: 24000, // This must match the API's output sample rate
//       bitDepth: 16,
//       channels: 1
//     });

//     // Pipe the raw binary data through the WAV writer and then to the response
//     passthrough.pipe(wavWriter).pipe(res);

//     // Write the audio buffer to the passthrough stream to send the WAV file to the client
//     passthrough.end(audioBuffer);
    
//   }
//   catch (error) {
//     console.error('TTS Error:', error);
//     res.status(500).send('Error generating speech');
//   }
// })

// old tts for saving on requests made to gemini api
app.post('/speech/synthesize', async (req, res) => {
  try {
    const {text} = req.body;
    
    const  voice = {languageCode: 'en-US', name :'en-US-Neural2-G' };
    const request = {
        input: { text: text},
        voice: voice,
        audioConfig: { audioEncoding: 'MP3' },
      };
    
    // debugging
    console.log("Received request for text-to-speech synthesis:", request);

    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + GOOGLE_API_KEY, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
      });

    const data = await response.json();
    //res.json(data);
    const audioBuffer = Buffer.from(data.audioContent, 'base64');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.end(audioBuffer);

  } catch (error) {
      console.error('Server Error in Google Text-to-Speech:', error);
      res.status(500).json({ message: error.toString() });
  }
});

// Helper function to format the audio for the API
function bufferToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType,
    },
  };
}


// 6. Define the API endpoint for transcription
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No audio file uploaded.');
  }

  try {
    const audioPart = bufferToGenerativePart(req.file.buffer, req.file.mimetype);
    const expectedNumber = parseInt(req.body.expectedNumber || '', 10);
    const expectedClause = Number.isFinite(expectedNumber) && expectedNumber >= 1 && expectedNumber <= 10
      ? `The expected next number is ${expectedNumber}. Favor that number if it is spoken.`
      : '';
    const prompt = `
You are transcribing a short audio chunk from a child counting cookies.
Return ONLY numbers that are explicitly audible in this chunk.
Do NOT infer or auto-complete a counting sequence.
${expectedClause}

Strict rules:
- Output must be plain text only.
- Allowed tokens: "1" to "10" only.
- Return at most one number token.
- If uncertain, return an empty string.
- Do not add explanations, labels, punctuation, or markdown.
`;
    
    const result = await model2.generateContent([prompt, audioPart]);
    const response = result.response;
    const rawTranscript = response.text() || '';

    // Safety filter on the server: keep only number tokens 1..10.
    const cleanedTokens = rawTranscript
      .replace(/\n/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => /^(10|[1-9])$/.test(token));
    const transcript = cleanedTokens.join(' ');
    
    console.log(`Transcription: ${transcript}`);
    res.status(200).json({ transcript: transcript });

  } catch (error) {
    console.error('ERROR:', error);
    res.status(500).send('Error during transcription.');
  }
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

const httpServer = http.createServer(app);
attachLiveAgent(httpServer, GEMINI_API_KEY);

connectToDb()
  .then(() => {
    console.log("Successfully Connected to DB");

    httpServer.listen(PORT, () => {
      console.log("Server listening on port " + PORT);
    });
  })
  .catch((error) => {
    console.error("Error connecting to DB:", error);
  });

