const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const rateLimit = require('express-rate-limit');
const util = require('util');
const { execFile } = require('child_process');
const { z } = require('zod');

const execFilePromise = util.promisify(execFile);

// --- LOGGING SETUP WITH ROTATION ---
const logDir = process.env.LOG_DIR || (fs.existsSync('/app/log') ? '/app/log' : path.join(__dirname, '..', 'log'));
const logFilePath = path.join(logDir, 'backend.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB limit per file

if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (_) {}
}

let logFile = null;
try {
  logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
} catch (_) {}

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
        if (logFile) logFile.end();
        fs.renameSync(logFilePath, logFilePath + '.old');
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
  if (logFile) logFile.write(`[INFO] ${new Date().toISOString()} - ${msg}`);
  logStdout.write(msg);
};

console.error = function () {
  checkLogRotation();
  const msg = util.format.apply(null, arguments) + '\n';
  if (logFile) logFile.write(`[ERROR] ${new Date().toISOString()} - ${msg}`);
  logStderr.write(msg);
};
// ------------------------------------

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Load environment variables from .env if present (root or backend dir)
[path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')].forEach(envPath => {
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    } catch (_) {}
  }
});

const PORT = process.env.PORT || 3000;
const TEMP_AUDIO_DIR = process.env.TEMP_DIR || (fs.existsSync('/tmp/audio') ? '/tmp/audio' : path.join(__dirname, 'temp_audio'));
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const CACHE_DIR = path.join(__dirname, 'cache', 'subtitles');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1-hour cache TTL

if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (_) {}
}

/**
 * Prunes cached subtitles older than 1 hour.
 */
function pruneExpiredSubtitleCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const files = fs.readdirSync(CACHE_DIR);
    const now = Date.now();
    let pruned = 0;
    for (const file of files) {
      if (file.endsWith('.vtt')) {
        const filePath = path.join(CACHE_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs >= CACHE_TTL_MS) {
          fs.unlinkSync(filePath);
          pruned++;
        }
      }
    }
    if (pruned > 0) {
      console.log(`[Cache Prune] Pruned ${pruned} subtitle cache file(s) older than 1 hour.`);
    }
  } catch (e) {
    console.warn('[Cache Prune] Error pruning cache:', e.message);
  }
}

// Prune on startup and every 15 minutes
pruneExpiredSubtitleCache();
setInterval(pruneExpiredSubtitleCache, 15 * 60 * 1000);

const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120, 
  message: { error: 'Security limit: Maximum requests reached. Please try again later.' }
});

const pinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many PIN attempts. Please wait 15 minutes.' }
});

const pinVerifySchema = z.object({
  pin: z.string().trim().min(1).max(32)
});

// --- INPUT VALIDATION SCHEMA ---
const subtitleGenerateSchema = z.object({
  lank: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid lank identifier format'),
  targetLang: z.string().trim().min(2).max(10).regex(/^[a-zA-Z_-]{2,10}$/, 'Invalid target language code'),
  sourceLang: z.string().trim().min(2).max(10).regex(/^[a-zA-Z_-]{2,10}$/).optional(),
  audioUrl: z.string().url('Invalid audio URL format').optional(),
  subtitleUrl: z.string().url('Invalid subtitle URL format').optional(),
});

/**
 * Validates whether an external URL belongs to trusted JW CDN domains (SSRF protection).
 */
function isAllowedCdnUrl(urlString) {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'b.jw-cdn.org' ||
      hostname.endsWith('.jw-cdn.org') ||
      hostname === 'assets.jw-cdn.org'
    );
  } catch (e) {
    return false;
  }
}

async function fetchWithRetry(requestFn, maxRetries = 5, delayMs = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const errCode = err.code || (err.response && err.response.status) || 'UNKNOWN';
      const errData = err.response?.data;
      const errDetails = errData ? (typeof errData === 'object' ? JSON.stringify(errData) : String(errData).slice(0, 100)) : (err.message || '');
      
      let waitMs = delayMs;
      // Handle rate limits dynamically
      const retryAfterHeader = err.response?.headers?.['retry-after'];
      if (retryAfterHeader) {
        waitMs = Math.max(delayMs, Math.ceil(parseFloat(retryAfterHeader)) * 1000 + 500);
      } else if (errData?.error?.message && errData.error.message.includes('Please try again in')) {
        const match = errData.error.message.match(/try again in ([\d.]+)s/i);
        if (match) {
          waitMs = Math.ceil(parseFloat(match[1])) * 1000 + 1000;
        }
      }

      console.log(`[Retry] Request failed (${errCode}) ${errDetails}. Retrying in ${waitMs}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(res => setTimeout(res, waitMs));
    }
  }
}

const ISO_TO_JW_LANG = {
  en: 'E',
  es: 'S',
  fr: 'F',
  nl: 'O',
  de: 'X',
  it: 'I',
  pt: 'T',
  ru: 'U',
  ja: 'J',
  zh: 'CHS',
  ko: 'KO',
  tl: 'TG',
  fil: 'TG',
  pl: 'P',
  sv: 'Z',
  el: 'G',
  ar: 'A'
};

async function findNativeSubtitle(lank, langIso = 'en') {
  const iso = (langIso || 'en').toLowerCase().slice(0, 2);
  const langCode = ISO_TO_JW_LANG[iso] || iso.toUpperCase();

  try {
    const res = await axios.get(`https://b.jw-cdn.org/apis/mediator/v1/media-items/${langCode}/${lank}?clientType=www`, { timeout: 15000 });
    const mediaNode = res.data.media?.[0];
    if (!mediaNode) return null;

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
      console.log(`[${lank}] Found native subtitle match in ${iso.toUpperCase()} (${langCode})!`);
      return { vttUrl: extractedVtt, sourceLangIso: iso };
    }
  } catch (e) {}
  return null;
}

async function getSmallestVideoUrl(lank) {
  for (const lang of ['E', 'S', 'F']) {
    try {
      const res = await axios.get(`https://b.jw-cdn.org/apis/mediator/v1/media-items/${lang}/${lank}?clientType=www`, { timeout: 10000 });
      const files = res.data.media?.[0]?.files || [];
      const videoFiles = files.filter(f => f.progressiveDownloadURL);
      if (videoFiles.length > 0) {
        // 1. Prefer lightweight MP4 stream (<= 25MB) so it can be uploaded directly to Groq Whisper if FFmpeg is unavailable
        const mp4Files = videoFiles.filter(f => f.progressiveDownloadURL.endsWith('.mp4'));
        if (mp4Files.length > 0) {
          const sortedMp4 = [...mp4Files].sort((a, b) => (a.filesize || a.frameHeight || 9999) - (b.filesize || b.frameHeight || 9999));
          console.log(`[${lank}] Selected lightweight MP4 video stream: ${sortedMp4[0].progressiveDownloadURL.slice(-35)}`);
          return sortedMp4[0].progressiveDownloadURL;
        }

        // 2. Explicit 144p preference (lightest stream for Whisper)
        const p144 = videoFiles.find(f => f.label === '144p' || (f.progressiveDownloadURL && f.progressiveDownloadURL.includes('144P')));
        if (p144) {
          console.log(`[${lank}] Selected 144p stream for Whisper: ${p144.progressiveDownloadURL.slice(-35)}`);
          return p144.progressiveDownloadURL;
        }

        // 3. Smallest file size
        const sortedBySize = [...videoFiles].filter(f => f.filesize).sort((a, b) => a.filesize - b.filesize);
        if (sortedBySize.length > 0) return sortedBySize[0].progressiveDownloadURL;

        // 4. Smallest frame height
        const sortedByHeight = [...videoFiles].sort((a, b) => (a.frameHeight || 9999) - (b.frameHeight || 9999));
        return sortedByHeight[0].progressiveDownloadURL;
      }
    } catch (e) {}
  }
  return null;
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

// Health check and system capability endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    aiEnabled: Boolean(GROQ_API_KEY && GROQ_API_KEY.trim()),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    aiEnabled: Boolean(GROQ_API_KEY && GROQ_API_KEY.trim())
  });
});

app.post('/api/auth/verify', pinRateLimiter, (req, res) => {
  const parseResult = pinVerifySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid PIN format.'
    });
  }
  const currentPin = (process.env.APP_PIN || process.env.VITE_APP_PIN || '1234').toString();
  if (parseResult.data.pin === currentPin) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: 'Incorrect PIN.' });
});

app.post('/api/subtitles/generate', aiRateLimiter, async (req, res) => {
  // Check if AI subtitle feature is disabled
  if (!GROQ_API_KEY || !GROQ_API_KEY.trim()) {
    return res.status(503).json({
      error: 'AI subtitle feature is disabled. GROQ_API_KEY is not configured on the server.'
    });
  }

  const parseResult = subtitleGenerateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ 
      error: 'Invalid request parameters.', 
      details: parseResult.error.flatten().fieldErrors 
    });
  }

  const { lank, targetLang, sourceLang, audioUrl, subtitleUrl } = parseResult.data;
  const sanitizedLank = lank.replace(/[^a-zA-Z0-9_-]/g, '');
  const targetLangIso = targetLang.toLowerCase().slice(0, 2);
  const cachedFilePath = path.join(CACHE_DIR, `${sanitizedLank}_${targetLangIso}.vtt`);

  // 1. Check persistent disk cache (strictly valid for 1 hour max)
  if (fs.existsSync(cachedFilePath)) {
    try {
      const stat = fs.statSync(cachedFilePath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < CACHE_TTL_MS) {
        console.log(`[Cache Hit] Serving cached subtitles for ${sanitizedLank} (${targetLangIso}) [Age: ${Math.round(ageMs / 1000)}s / 1h TTL]`);
        const cachedContent = fs.readFileSync(cachedFilePath, 'utf-8');
        return res.json({
          status: 'success',
          source: 'cache',
          vttContent: cachedContent
        });
      } else {
        console.log(`[Cache Expired] Subtitles for ${sanitizedLank} (${targetLangIso}) expired (> 1 hour). Deleting cache.`);
        try { fs.unlinkSync(cachedFilePath); } catch (_) {}
      }
    } catch (cacheReadErr) {
      console.warn(`[Cache Warning] Failed reading cache for ${sanitizedLank}:`, cacheReadErr.message);
    }
  }

  // SSRF check on custom audioUrl or subtitleUrl if provided
  if (audioUrl && !isAllowedCdnUrl(audioUrl)) {
    return res.status(400).json({ error: 'Untrusted audio URL origin. Only jw-cdn.org domains are accepted.' });
  }
  if (subtitleUrl && !isAllowedCdnUrl(subtitleUrl)) {
    return res.status(400).json({ error: 'Untrusted subtitle URL origin. Only jw-cdn.org domains are accepted.' });
  }

  const tempVideoPath = path.join(TEMP_AUDIO_DIR, `${sanitizedLank}_input.mp4`);
  const tempAudioPath = path.join(TEMP_AUDIO_DIR, `${sanitizedLank}.mp3`);

  try {
    let sourceVtt = null;
    let sourceLangIso = targetLangIso;
    let sourceFoundDirectly = false;

    // A. Check if subtitles are natively available directly in the requested target language
    console.log(`[${sanitizedLank}] Step 1: Checking if native subtitles exist in ${targetLangIso.toUpperCase()}...`);
    const nativeTargetSub = await findNativeSubtitle(sanitizedLank, targetLangIso);
    if (nativeTargetSub) {
      try {
        const targetResp = await axios.get(nativeTargetSub.vttUrl, { timeout: 15000 });
        if (targetResp.data && typeof targetResp.data === 'string' && targetResp.data.includes('WEBVTT')) {
          sourceVtt = targetResp.data;
          sourceLangIso = targetLangIso;
          sourceFoundDirectly = true;
          console.log(`[${sanitizedLank}] Found and downloaded native ${targetLangIso.toUpperCase()} subtitles.`);
        }
      } catch (err) {
        console.log(`[${sanitizedLank}] Failed downloading native ${targetLangIso.toUpperCase()} VTT:`, err.message);
      }
    }

    // B. If not in target language: Check if available in English ('en' / 'E')
    let nativeEnglishSub = null;
    if (!sourceVtt) {
      console.log(`[${sanitizedLank}] Step 2: Subtitles not in ${targetLangIso.toUpperCase()}. Checking if available in English (EN)...`);

      // Check client-provided subtitleUrl if it is English
      if (subtitleUrl) {
        try {
          const subResp = await axios.get(subtitleUrl, { timeout: 15000 });
          if (subResp.data && typeof subResp.data === 'string' && subResp.data.includes('WEBVTT')) {
            sourceVtt = subResp.data;
            sourceLangIso = 'en';
            console.log(`[${sanitizedLank}] Using client-provided English subtitle URL.`);
          }
        } catch (_) {}
      }

      if (!sourceVtt) {
        nativeEnglishSub = await findNativeSubtitle(sanitizedLank, 'en');
        if (nativeEnglishSub) {
          console.log(`[${sanitizedLank}] Downloading native English (EN) VTT...`);
          try {
            const enResponse = await axios.get(nativeEnglishSub.vttUrl, { timeout: 15000 });
            if (enResponse.data && typeof enResponse.data === 'string' && enResponse.data.includes('WEBVTT')) {
              sourceVtt = enResponse.data;
              sourceLangIso = 'en';
            }
          } catch (err) {
            console.log(`[${sanitizedLank}] Failed downloading native English VTT:`, err.message);
          }
        }
      }
    }

    // B2. If not available in English either: Check if available in other common languages (es, fr) before heavy transcription
    if (!sourceVtt) {
      for (const fallbackLang of ['es', 'fr']) {
        const nativeFallbackSub = await findNativeSubtitle(sanitizedLank, fallbackLang);
        if (nativeFallbackSub) {
          console.log(`[${sanitizedLank}] Found native ${fallbackLang.toUpperCase()} fallback VTT. Downloading...`);
          try {
            const fbResp = await axios.get(nativeFallbackSub.vttUrl, { timeout: 15000 });
            if (fbResp.data && typeof fbResp.data === 'string' && fbResp.data.includes('WEBVTT')) {
              sourceVtt = fbResp.data;
              sourceLangIso = fallbackLang;
              break;
            }
          } catch (_) {}
        }
      }
    }

    // C. If NOT available in native subtitles: Download media stream -> Whisper transcription
    if (!sourceVtt) {
      if (!GROQ_API_KEY || !GROQ_API_KEY.trim()) {
        return res.status(503).json({ error: 'AI subtitle feature is disabled. GROQ_API_KEY is not configured on the server.' });
      }

      console.log(`[${sanitizedLank}] Step 3: Subtitles not available natively. Resolving lightweight media for Whisper transcription...`);
      let mediaSourceUrl = await getSmallestVideoUrl(sanitizedLank);
      if (!mediaSourceUrl && audioUrl) {
        mediaSourceUrl = audioUrl;
      }

      if (!mediaSourceUrl) {
        return res.status(404).json({ error: 'Could not resolve media for transcription.' });
      }

      if (!fs.existsSync(TEMP_AUDIO_DIR)) {
        fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
      }

      const mediaUrlParsed = new URL(mediaSourceUrl);
      const mediaExt = path.extname(mediaUrlParsed.pathname) || '.mp4';
      const currentTempVideoPath = path.join(TEMP_AUDIO_DIR, `${sanitizedLank}_input${mediaExt}`);

      const writer = fs.createWriteStream(currentTempVideoPath);
      const audioResponse = await axios({ 
        url: mediaSourceUrl, 
        method: 'GET', 
        responseType: 'stream',
        timeout: 60000 
      });
      
      audioResponse.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      let fileToUpload = currentTempVideoPath;
      let filenameToUpload = path.basename(currentTempVideoPath);
      let ffmpegWorked = false;

      console.log(`[${sanitizedLank}] Attempting audio extraction using FFmpeg...`);
      try {
        // -vn: No video, -ac 1: Mono, -ar 16000: 16kHz, -ab 32k: 32kbps bitrate
        await execFilePromise('ffmpeg', [
          '-i', currentTempVideoPath,
          '-vn',
          '-ac', '1',
          '-ar', '16000',
          '-ab', '32k',
          '-y',
          tempAudioPath
        ]);
        if (fs.existsSync(tempAudioPath)) {
          fileToUpload = tempAudioPath;
          filenameToUpload = `${sanitizedLank}.mp3`;
          ffmpegWorked = true;
          console.log(`[${sanitizedLank}] FFmpeg audio extraction succeeded.`);
        }
      } catch (ffmpegErr) {
        console.warn(`[${sanitizedLank}] FFmpeg extraction unavailable (${ffmpegErr.message}). Using direct file upload to Groq Whisper...`);
      }

      const stats = fs.statSync(fileToUpload);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(`[${sanitizedLank}] Media file ready (${fileSizeMB.toFixed(2)}MB, ${filenameToUpload}). Transcribing with Groq Whisper...`);

      if (fileSizeMB > 25) {
        return res.status(400).json({ error: `Audio/Video file is too large (${fileSizeMB.toFixed(1)}MB). Groq limit is 25MB.` });
      }

      const ext = path.extname(fileToUpload).toLowerCase();
      const supportedGroqExts = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg'];
      if (!ffmpegWorked && !supportedGroqExts.includes(ext)) {
        throw new Error(`FFmpeg is not installed and ${ext} format is not natively supported by Groq Whisper. Please install FFmpeg.`);
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(fileToUpload), { filename: filenameToUpload });
      formData.append('model', 'whisper-large-v3'); 
      formData.append('response_format', 'verbose_json');

      if (sourceLang && sourceLang.toLowerCase() !== 'auto') {
        formData.append('language', sourceLang.toLowerCase().slice(0, 2));
      }

      const whisperResponse = await fetchWithRetry(() => axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000 
      }), 3, 4000); 

      sourceVtt = jsonToVtt(whisperResponse.data);
      sourceLangIso = whisperResponse.data.language || (sourceLang ? sourceLang.slice(0, 2) : 'en');
      console.log(`[${sanitizedLank}] Whisper transcription successful in language: ${sourceLangIso}`);

      // Clean up downloaded video
      try {
        if (fs.existsSync(currentTempVideoPath)) fs.unlinkSync(currentTempVideoPath);
      } catch (_) {}
    }

    // D. If source VTT already matches target language, bypass translation
    if (sourceFoundDirectly || sourceLangIso.toLowerCase() === targetLangIso) {
      console.log(`[${sanitizedLank}] Subtitles are already in ${targetLangIso.toUpperCase()}. Bypassing translation.`);
      try {
        fs.writeFileSync(cachedFilePath, sourceVtt, 'utf-8');
      } catch (_) {}
      return res.json({
        status: 'success',
        source: sourceFoundDirectly ? 'native-direct' : 'transcribed-direct',
        vttContent: sourceVtt
      });
    }

    // E. Translate source VTT (from English or transcribed script) to target language
    let translatedVtt = null;
    if (GROQ_API_KEY) {
      try {
        console.log(`[${sanitizedLank}] Fast-translating VTT from ${sourceLangIso.toUpperCase()} to ${targetLangIso.toUpperCase()} via Groq LLM...`);
        translatedVtt = await translateVttWithGroq(sourceVtt, sourceLangIso, targetLangIso, GROQ_API_KEY);
      } catch (groqErr) {
        console.warn(`[${sanitizedLank}] Groq LLM translation failed (${groqErr.message}). Falling back to Google Translate...`);
      }
    }

    // Fallback: Google Translate if Groq LLM unavailable or error
    if (!translatedVtt) {
      console.log(`[${sanitizedLank}] Translating VTT from ${sourceLangIso} to ${targetLangIso} via fallback translation...`);
      translatedVtt = await translateVtt(sourceVtt, sourceLangIso, targetLangIso);
    }

    // Save generated subtitles to disk cache (valid 1 hour)
    try {
      fs.writeFileSync(cachedFilePath, translatedVtt, 'utf-8');
      console.log(`[Cache Saved] Subtitles for ${sanitizedLank} (${targetLangIso}) saved to cache (TTL: 1h).`);
    } catch (cacheErr) {
      console.warn(`[Cache Warning] Failed saving cache for ${sanitizedLank}:`, cacheErr.message);
    }

    console.log(`[${sanitizedLank}] Successfully produced subtitles for ${targetLangIso}.`);
    return res.json({ 
      status: 'success', 
      source: nativeEnglishSub ? 'translated-from-en' : 'transcribed-and-translated', 
      vttContent: translatedVtt 
    });

  } catch (error) {
    console.error(`[${sanitizedLank}] Subtitle generation failed:`, error.message);
    if (error.response) {
      console.error(`[${sanitizedLank}] API Error Response:`, JSON.stringify(error.response.data));
    }
    return res.status(500).json({ error: error.message || 'Failed to generate AI subtitles.' });
  } finally {
    // Guaranteed cleanup of temporary files
    try {
      if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    } catch (_) {}
    try {
      if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
    } catch (_) {}
  }
});

function parseVtt(vttString) {
  const blocks = vttString.replace(/\r/g, '').split('\n\n').filter(b => b.trim().length > 0);
  let header = 'WEBVTT';
  const parsedCues = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (i === 0 && block.startsWith('WEBVTT')) {
      header = block;
      continue;
    }

    const lines = block.split('\n');
    let id = '';
    let timestamp = '';
    let textLines = [];

    if (lines[0].includes('-->')) {
      timestamp = lines[0];
      textLines = lines.slice(1);
    } else if (lines.length > 1 && lines[1].includes('-->')) {
      id = lines[0];
      timestamp = lines[1];
      textLines = lines.slice(2);
    } else {
      continue;
    }

    parsedCues.push({
      idx: parsedCues.length + 1,
      id,
      timestamp,
      text: textLines.join('\n').trim()
    });
  }

  return { header, parsedCues };
}

async function translateVtt(vttString, sourceLang, targetLang) {
  const { header, parsedCues } = parseVtt(vttString);
  if (parsedCues.length === 0) return vttString;

  const sl = sourceLang.toLowerCase().slice(0, 2);
  const tl = targetLang.toLowerCase().slice(0, 2);

  const translatedMap = {};
  for (const cue of parsedCues) {
    if (!cue.text.trim()) continue;
    const cleanText = cue.text.replace(/\n/g, ' ').trim();
    try {
      // 1. Try MyMemory API (free, reliable translation)
      const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${sl}|${tl}`;
      const res = await axios.get(myMemoryUrl, { timeout: 8000 });
      const translated = res.data?.responseData?.translatedText;
      if (translated && !translated.includes('MYMEMORY WARNING')) {
        translatedMap[cue.idx] = translated.trim();
        await new Promise(r => setTimeout(r, 80));
        continue;
      }
    } catch (_) {}

    try {
      // 2. Try Google Translate fallback
      const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(cleanText)}`;
      const gtxRes = await axios.get(gtxUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (gtxRes.data && gtxRes.data[0] && gtxRes.data[0][0] && gtxRes.data[0][0][0]) {
        translatedMap[cue.idx] = gtxRes.data[0][0][0].trim();
      }
    } catch (_) {}
  }

  let finalVtt = header + '\n\n';
  for (const cue of parsedCues) {
    if (cue.id) finalVtt += cue.id + '\n';
    finalVtt += cue.timestamp + '\n';
    finalVtt += (translatedMap[cue.idx] || cue.text) + '\n\n';
  }

  return finalVtt.trim();
}

function getLanguageName(isoCode) {
  const code = (isoCode || '').toLowerCase().trim();
  const manualMap = {
    tl: 'Tagalog',
    fil: 'Filipino (Tagalog)',
    zh: 'Simplified Chinese',
    'zh-tw': 'Traditional Chinese',
    'zh-cn': 'Simplified Chinese',
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    nl: 'Dutch',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    pl: 'Polish',
    ro: 'Romanian',
    sv: 'Swedish'
  };
  if (manualMap[code]) return manualMap[code];
  const shortCode = code.slice(0, 2);
  if (manualMap[shortCode]) return manualMap[shortCode];
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    const name = dn.of(code) || dn.of(shortCode);
    if (name) return name;
  } catch (_) {}
  return isoCode;
}

/**
 * Ultra-fast dialogue-only WebVTT translation using Groq LLM.
 * Keeps timestamps, cue IDs, and alignment tags 100% intact and immune to corruption.
 */
async function translateVttWithGroq(vttString, sourceLang, targetLang, apiKey) {
  if (!apiKey) throw new Error('GROQ_API_KEY is required');

  const { header, parsedCues } = parseVtt(vttString);
  if (parsedCues.length === 0) return vttString;

  const targetLangName = getLanguageName(targetLang);
  const sourceLangName = getLanguageName(sourceLang);

  const CHUNK_SIZE = 15;
  const translatedMap = {};
  const modelToUse = process.env.GROQ_TRANSLATION_MODEL || 'qwen/qwen3.8-27b';

  console.log(`[Groq Translation] Processing ${parsedCues.length} cues across ${Math.ceil(parsedCues.length / CHUNK_SIZE)} chunk(s) from ${sourceLangName} into ${targetLangName} using ${modelToUse}...`);

  for (let i = 0; i < parsedCues.length; i += CHUNK_SIZE) {
    const chunk = parsedCues.slice(i, i + CHUNK_SIZE);
    const promptText = chunk.map(c => `[${c.idx}] ${c.text.replace(/\n/g, ' ')}`).join('\n');

    const requestPayload = {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: `You are an expert subtitle translation engine. Your task is ONLY to translate each numbered line of dialogue from ${sourceLangName} into natural, faithful, and accurate ${targetLangName}.

STRICT INSTRUCTIONS (MANDATORY):
1. Output EXACTLY one line per item in the format: [n] <translated text>
2. Maintain the exact cue number [n] without skipping or renumbering.
3. Do NOT interpret, summarize, embellish, explain, or alter the meaning of any text.
4. Do NOT add any commentary, notes, conversational filler, markdown formatting (do NOT use \`\`\` code fences), or explanations.
5. Output ONLY the raw numbered lines.`
        },
        {
          role: 'user',
          content: `Translate the following dialogue lines into ${targetLangName}:\n${promptText}`
        }
      ],
      temperature: 0.1,
      max_tokens: Math.min(Math.max(chunk.length * 15, 100), 250)
    };

    if (modelToUse.toLowerCase().includes('qwen')) {
      requestPayload.reasoning_effort = 'none';
    }

    const response = await fetchWithRetry(() => axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      requestPayload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000
      }
    ), 4, 1500);

    const translatedChunk = response.data?.choices?.[0]?.message?.content || response.data?.choices?.[0]?.message?.reasoning || '';
    const lines = translatedChunk.split('\n');
    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (match) {
        translatedMap[parseInt(match[1], 10)] = match[2].trim();
      }
    }

    if (i + CHUNK_SIZE < parsedCues.length) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  const translatedCount = Object.keys(translatedMap).length;
  if (translatedCount === 0 && parsedCues.length > 0) {
    throw new Error('Groq translation produced no parsed cues.');
  }

  let finalVtt = header + '\n\n';
  for (const cue of parsedCues) {
    if (cue.id) finalVtt += cue.id + '\n';
    finalVtt += cue.timestamp + '\n';
    finalVtt += (translatedMap[cue.idx] || cue.text) + '\n\n';
  }

  return finalVtt.trim();
}

// --- STATIC FILE SERVING FOR FRONTEND (UNIFIED CONTAINER) ---
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, 'public');
const distFallback = path.join(__dirname, '../dist');

let staticPath = null;
if (fs.existsSync(publicDir)) {
  staticPath = publicDir;
} else if (fs.existsSync(distFallback)) {
  staticPath = distFallback;
}

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend Orchestrator running on port ${PORT}`);
  });
}

module.exports = {
  app,
  jsonToVtt,
  subtitleGenerateSchema,
  isAllowedCdnUrl,
  translateVtt,
  translateVttWithGroq,
  CACHE_DIR,
  CACHE_TTL_MS,
  pruneExpiredSubtitleCache,
  findNativeSubtitle,
  getSmallestVideoUrl,
  getLanguageName,
  parseVtt,
  pinVerifySchema
};