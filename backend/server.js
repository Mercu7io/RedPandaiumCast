const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const rateLimit = require('express-rate-limit');
const util = require('util');
const { exec } = require('child_process');

const execPromise = util.promisify(exec);

// --- LOGGING SETUP WITH ROTATION ---
const logDir = '/app/log';
const logFilePath = path.join(logDir, 'backend.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB limit per file

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

let logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
const logStdout = process.stdout;
const logStderr = process.stderr;

/**
 * Checks if the log file exceeds the maximum size.
 * If it does, renames the current log to .old and starts a new one.
 */
function checkLogRotation() {
  try {
    if (fs.existsSync(logFilePath)) {
      const stats = fs.statSync(logFilePath);
      if (stats.size > MAX_LOG_SIZE) {
        logFile.end();
        // Rename current to .old (overwrites previous backup)
        fs.renameSync(logFilePath, logFilePath + '.old');
        // Open a fresh stream
        logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
      }
    }
  } catch (err) {
    logStderr.write(`[Internal] Log rotation failed: ${err.message}\n`);
  }
}

console.log = function () {
  checkLogRotation();
  const msg = util.format.apply(null, arguments) + '\n';
  logFile.write(`[INFO] ${new Date().toISOString()} - ${msg}`);
  logStdout.write(msg);
};

console.error = function () {
  checkLogRotation();
  const msg = util.format.apply(null, arguments) + '\n';
  logFile.write(`[ERROR] ${new Date().toISOString()} - ${msg}`);
  logStderr.write(msg);
};
// ------------------------------------

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TEMP_AUDIO_DIR = '/tmp/audio';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10, 
  message: { error: 'Security limit: Maximum requests reached. Please try again later.' }
});

async function fetchWithRetry(requestFn, maxRetries = 20, delayMs = 4000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const errCode = err.code || (err.response && err.response.status) || 'UNKNOWN';
      console.log(`[Retry] Request failed (${errCode}). Retrying in ${delayMs}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}

const FALLBACK_LANGS = [
  { code: 'E', iso: 'en' }
];

async function findNativeSubtitle(lank) {
  for (const lang of FALLBACK_LANGS) {
    try {
      const res = await axios.get(`https://b.jw-cdn.org/apis/mediator/v1/media-items/${lang.code}/${lank}?clientType=www`);
      const mediaNode = res.data.media[0];
      if (!mediaNode) continue;

      let extractedVtt = '';
      if (mediaNode.subtitles && mediaNode.subtitles.length > 0) {
        extractedVtt = mediaNode.subtitles.find(s => s.file?.url?.endsWith('.vtt'))?.file?.url || '';
      }
      if (!extractedVtt && mediaNode.files) {
        const fileWithSub = mediaNode.files.find(f => f.subtitles?.url?.endsWith('.vtt'));
        if (fileWithSub) extractedVtt = fileWithSub.subtitles.url;
      }
      if (!extractedVtt && mediaNode.files) {
        const fileVtt = mediaNode.files.find(f => f.progressiveDownloadURL?.endsWith('.vtt'));
        if (fileVtt) extractedVtt = fileVtt.progressiveDownloadURL;
      }

      if (extractedVtt) {
        console.log(`[${lank}] Found native subtitle match in ${lang.iso.toUpperCase()}!`);
        return { vttUrl: extractedVtt, sourceLangIso: lang.iso };
      }
    } catch (e) {}
  }
  return null;
}

async function getSmallestVideoUrl(lank) {
  try {
    const res = await axios.get(`https://b.jw-cdn.org/apis/mediator/v1/media-items/E/${lank}?clientType=www`);
    const files = res.data.media[0]?.files || [];
    const videoFiles = files.filter(f => f.progressiveDownloadURL);
    if (videoFiles.length === 0) return null;
    videoFiles.sort((a, b) => (a.frameHeight || 9999) - (b.frameHeight || 9999));
    return videoFiles[0].progressiveDownloadURL;
  } catch (e) {
    return null;
  }
}

/**
 * Converts Groq/OpenAI verbose_json transcription to standard VTT format.
 */
function jsonToVtt(json) {
  let vtt = "WEBVTT\n\n";
  if (!json.segments) return vtt;
  
  const formatTime = (seconds) => {
    const pad = (num, size) => num.toString().padStart(size, '0');
    const hh = Math.floor(seconds / 3600);
    const mm = Math.floor((seconds % 3600) / 60);
    const ss = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(ms, 3)}`;
  };

  json.segments.forEach((seg, index) => {
    vtt += `${index + 1}\n`;
    vtt += `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n`;
    vtt += `${seg.text.trim()}\n\n`;
  });
  
  return vtt;
}

app.post('/api/subtitles/generate', aiRateLimiter, async (req, res) => {
  const { lank, targetLang, audioUrl } = req.body;

  if (!lank || !targetLang) {
    return res.status(400).json({ error: 'Missing lank or targetLang parameters.' });
  }

  try {
    let sourceVtt = null;
    let sourceLangIso = 'en';

    const nativeSub = await findNativeSubtitle(lank);

    if (nativeSub) {
      console.log(`[${lank}] Downloading native ${nativeSub.sourceLangIso} VTT...`);
      const response = await axios.get(nativeSub.vttUrl);
      sourceVtt = response.data;
      sourceLangIso = nativeSub.sourceLangIso;
    } else {
      if (!GROQ_API_KEY) {
        return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server.' });
      }

      console.log(`[${lank}] No native fallback subtitles found. Fetching media for Groq Cloud API...`);
      const optimizedAudioUrl = await getSmallestVideoUrl(lank) || audioUrl;
      if (!optimizedAudioUrl) {
        return res.status(400).json({ error: 'Could not resolve media for transcription.' });
      }

      if (!fs.existsSync(TEMP_AUDIO_DIR)) fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
      
      const tempVideoPath = path.join(TEMP_AUDIO_DIR, `${lank}_input.mp4`);
      const tempAudioPath = path.join(TEMP_AUDIO_DIR, `${lank}.mp3`);
      const writer = fs.createWriteStream(tempVideoPath);
      const audioResponse = await axios({ url: optimizedAudioUrl, method: 'GET', responseType: 'stream' });
      
      audioResponse.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`[${lank}] Extracting highly compressed audio for Groq...`);
      try {
        // -vn: No video, -ac 1: Mono, -ar 16000: 16kHz, -ab 32k: 32kbps bitrate
        // This makes the file tiny while keeping voice clear for AI.
        await execPromise(`ffmpeg -i "${tempVideoPath}" -vn -ac 1 -ar 16000 -ab 32k -y "${tempAudioPath}"`);
      } catch (ffmpegErr) {
        console.error(`[${lank}] FFmpeg extraction failed:`, ffmpegErr.message);
        throw new Error('Failed to extract audio from video.');
      }

      const stats = fs.statSync(tempAudioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(`[${lank}] Audio extraction complete (${fileSizeMB.toFixed(2)}MB). Transcribing with Groq...`);

      if (fileSizeMB > 25) {
        console.error(`[${lank}] Audio file still too large for Groq (Limit 25MB).`);
        return res.status(400).json({ error: `Audio file is too large (${fileSizeMB.toFixed(1)}MB). Groq limit is 25MB.` });
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempAudioPath), { filename: 'audio.mp3' });
      formData.append('model', 'whisper-large-v3'); 
      formData.append('response_format', 'verbose_json');
      formData.append('language', 'en');

      const whisperResponse = await fetchWithRetry(() => axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000 
      }), 3, 5000); 

      sourceVtt = jsonToVtt(whisperResponse.data);
      sourceLangIso = 'en';
      
      console.log(`[${lank}] Groq transcription successful.`);
      
      // Cleanup temp files
      if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
      if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath); 
    }

    if (sourceLangIso.toLowerCase() === targetLang.toLowerCase()) {
      console.log(`[${lank}] Target language matches source. Bypassing translation.`);
      return res.json({ status: 'success', source: nativeSub ? 'native-cascade' : 'transcribed', vttContent: sourceVtt });
    }

    console.log(`[${lank}] Translating VTT from ${sourceLangIso} to ${targetLang} via Google Translate API...`);
    const translatedVtt = await translateVtt(sourceVtt, sourceLangIso, targetLang);

    console.log(`[${lank}] Successfully generated AI subtitles.`);
    
    return res.json({ status: 'success', source: 'on-the-fly', vttContent: translatedVtt });

  } catch (error) {
    console.error(`[${lank}] Subtitle generation failed:`, error.message);
    if (error.response) {
      console.error(`[${lank}] API Error Response:`, JSON.stringify(error.response.data));
    }
    return res.status(500).json({ error: 'Failed to generate AI subtitles. Ensure models are loaded.' });
  }
});

async function translateVtt(vttString, sourceLang, targetLang) {
  const blocks = vttString.replace(/\r/g, '').split('\n\n');
  const header = blocks.shift(); 
  
  const parsedBlocks = [];
  const textsToTranslate = [];

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    
    let id = '';
    let timestamp = '';
    let textLines = [];

    if (lines[0].includes('-->')) {
      timestamp = lines[0];
      textLines = lines.slice(1);
    } else {
      id = lines[0];
      timestamp = lines[1];
      textLines = lines.slice(2);
    }

    textsToTranslate.push(textLines.join(' ').trim());
    parsedBlocks.push({ id, timestamp });
  }

  const translatedTexts = [];
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;

  for (const text of textsToTranslate) {
    if (currentChunk.length > 0 && currentLength + text.length + 1 > 450) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }
    currentChunk.push(text);
    currentLength += text.length + 1;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const joinedText = chunk.join('\n');
    
    console.log(`[Translation] Processing chunk ${i + 1} of ${chunks.length}...`);

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(joinedText)}`;
      const response = await fetchWithRetry(() => axios.get(url), 3, 2000);
      
      let translated = '';
      if (response.data && response.data[0]) {
        for (let j = 0; j < response.data[0].length; j++) {
          if (response.data[0][j][0]) translated += response.data[0][j][0];
        }
      }

      const translatedLines = translated.trim().split('\n').map(l => l.trim());

      if (translatedLines.length === chunk.length) {
        translatedTexts.push(...translatedLines);
      } else {
        console.log(`[Translation] Line mismatch in chunk ${i+1}. Falling back to 1-by-1.`);
        for (const singleText of chunk) {
          if (!singleText.trim()) {
            translatedTexts.push('');
            continue;
          }
          const singleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(singleText)}`;
          const singleRes = await fetchWithRetry(() => axios.get(singleUrl), 3, 2000);
          
          let singleTranslated = '';
          if (singleRes.data && singleRes.data[0]) {
            for (let j = 0; j < singleRes.data[0].length; j++) {
              if (singleRes.data[0][j][0]) singleTranslated += singleRes.data[0][j][0];
            }
          }
          translatedTexts.push(singleTranslated.trim() || singleText);
          await new Promise(resolve => setTimeout(resolve, 300)); 
        }
      }
    } catch (err) {
      console.error(`[Translation] Chunk ${i+1} failed:`, err.message);
      translatedTexts.push(...chunk); 
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  let finalVtt = header + '\n\n';
  for (let i = 0; i < parsedBlocks.length; i++) {
    const b = parsedBlocks[i];
    if (b.id) finalVtt += b.id + '\n';
    finalVtt += b.timestamp + '\n';
    finalVtt += translatedTexts[i] + '\n\n';
  }

  return finalVtt.trim();
}

app.listen(PORT, () => {
  console.log(`Backend Orchestrator running on port ${PORT}`);
});