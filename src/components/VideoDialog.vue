<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useAppStore } from '@/store/app';
import axios from 'axios';

const store = useAppStore();
const videoFiles = ref<any[]>([]);
const subtitleFiles = ref<any[]>([]);
const englishSubtitleUrl = ref('');
const loading = ref(false);
const videoPlayer = ref<HTMLVideoElement | null>(null);
const selectedQuality = ref('720p');
const showSubtitles = ref(true);

// Theatre Mode State
const isTheatreMode = ref(false);

// Playback Speed State
const playbackRate = ref(1.0);
const playbackRates = [
  { title: '0.5x', value: 0.5 },
  { title: '0.75x', value: 0.75 },
  { title: 'Normal', value: 1.0 },
  { title: '1.25x', value: 1.25 },
  { title: '1.5x', value: 1.5 },
  { title: '1.75x', value: 1.75 },
  { title: '2x', value: 2.0 }
];

// Share State
const shareVideoCopied = ref(false);

// AI Generation State
const aiLoading = ref(false);
const aiStatus = ref('');
const aiVttUrl = ref('');

// Subtitle Styling Settings
const subtitleStyleDialog = ref(false);
const subColor = ref(localStorage.getItem('jwcast_sub_color') || '#FFFFFF');
const subBgAlpha = ref(localStorage.getItem('jwcast_sub_bg_alpha') || '0.8');
const subFontSize = ref(localStorage.getItem('jwcast_sub_font_size') || '100');
const subFontFamily = ref(localStorage.getItem('jwcast_sub_font_family') || 'sans-serif');

watch(subColor, val => localStorage.setItem('jwcast_sub_color', val));
watch(subBgAlpha, val => localStorage.setItem('jwcast_sub_bg_alpha', val.toString()));
watch(subFontSize, val => localStorage.setItem('jwcast_sub_font_size', val.toString()));
watch(subFontFamily, val => localStorage.setItem('jwcast_sub_font_family', val));

const presetColors = [
  { text: 'White', value: '#FFFFFF' },
  { text: 'Yellow', value: '#FFFF00' },
  { text: 'Cyan', value: '#00FFFF' }
];

const presetFonts = [
  { text: 'Default (Sans-Serif)', value: 'sans-serif' },
  { text: 'Arial', value: 'Arial, sans-serif' },
  { text: 'Verdana', value: 'Verdana, sans-serif' },
  { text: 'Times New Roman', value: '"Times New Roman", serif' },
  { text: 'Courier New', value: '"Courier New", monospace' }
];

// Transcript Dialog Settings
const transcriptDialog = ref(false);
const transcriptText = ref('');
const loadingTranscript = ref(false);
const transcriptCopied = ref(false);

const dialog = computed({
  get: () => store.videoDialog,
  set: (val) => store.setVideoDialog(val)
});

const selectedVideo = computed(() => store.selectedVideo);
const videoLang = computed({ get: () => store.videoLanguage, set: (val) => store.setVideoLanguage(val) });
const subtitleLang = computed({ get: () => store.subtitleLanguage, set: (val) => store.setSubtitleLanguage(val) });

const availableQualities = computed(() => {
  return videoFiles.value
    .filter(f => f.progressiveDownloadURL)
    .map(f => f.label)
    .reverse();
});

const videoUrl = computed(() => {
  const file = videoFiles.value.find(f => f.label === selectedQuality.value) || videoFiles.value[0];
  return file?.progressiveDownloadURL || '';
});

// Native Subtitle strictly from JW API
const nativeSubtitleUrl = computed(() => {
  const file = subtitleFiles.value.find(f => f.file?.url?.endsWith('.vtt'));
  return file?.file?.url || '';
});

// Active Subtitle: Prefers AI generated VTT, falls back to Native
const activeSubtitleUrl = computed(() => {
  if (aiVttUrl.value) return aiVttUrl.value;
  return nativeSubtitleUrl.value;
});

// Safe Base64 Encoder for UTF-8 Characters
const safeBtoa = (str: string) => {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    return btoa(str);
  }
};

const smPlayerUrl = computed(() => {
  if (!videoUrl.value) return '';
  const baseUrl = "https://chromecast.smplayer.info/index.php?sfgc=I2ZmZmZmZg==&ss=MS4x";
  const params = `&url=${safeBtoa(videoUrl.value)}`;
  const titleParam = `&title=${safeBtoa(selectedVideo.value?.title || '')}`;
  const subParam = activeSubtitleUrl.value ? `&subtitles=${safeBtoa(activeSubtitleUrl.value)}` : '';
  return `${baseUrl}${params}${titleParam}${subParam}`;
});

// Video Timestamp Persistence
const saveTime = () => {
  if (!videoPlayer.value || !selectedVideo.value?.lank) return;
  const time = videoPlayer.value.currentTime;
  if (time > 0) {
    localStorage.setItem(`jwcast_time_${selectedVideo.value.lank}`, JSON.stringify({
      time,
      expires: Date.now() + 3600000 // 1 hour expiration
    }));
  }
};

const restoreTime = () => {
  if (!videoPlayer.value || !selectedVideo.value?.lank) return;
  const saved = localStorage.getItem(`jwcast_time_${selectedVideo.value.lank}`);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (Date.now() < data.expires) {
        videoPlayer.value.currentTime = data.time;
      } else {
        localStorage.removeItem(`jwcast_time_${selectedVideo.value.lank}`);
      }
    } catch (e) {}
  }
};

const enforceSubtitles = () => {
  if (!videoPlayer.value) return;
  const tracks = videoPlayer.value.textTracks;
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = showSubtitles.value ? 'showing' : 'hidden';
  }
};

const onVideoLoaded = () => {
  restoreTime();
  enforceSubtitles();
  if (videoPlayer.value) {
    videoPlayer.value.playbackRate = playbackRate.value;
  }
};

const fetchVideoData = async () => {
  if (!selectedVideo.value || !selectedVideo.value.lank) return;
  loading.value = true;
  aiVttUrl.value = ''; // Reset AI subtitles on new video fetch
  aiStatus.value = '';
  englishSubtitleUrl.value = ''; // Reset fallback
  
  try {
    const videoLangObj = store.getVideoLanguageObj || { code: 'E' };
    const subLangObj = store.getSubtitleLanguageObj || { code: 'F' };
    
    const requests: Promise<any>[] = [
      axios.get(`${store.mediatorUrl}/media-items/${videoLangObj.code}/${selectedVideo.value.lank}?clientType=www`),
      axios.get(`${store.mediatorUrl}/media-items/${subLangObj.code}/${selectedVideo.value.lank}?clientType=www`)
    ];

    // Fetch English fallback if the selected subtitle language is not already English
    if (subLangObj.code !== 'E') {
      requests.push(
        axios.get(`${store.mediatorUrl}/media-items/E/${selectedVideo.value.lank}?clientType=www`).catch(() => null)
      );
    }
    
    const responses = await Promise.all(requests);
    const vRes = responses[0];
    const sRes = responses[1];
    const enRes = responses.length > 2 ? responses[2] : null;
    
    videoFiles.value = vRes.data.media[0]?.files || [];
    
    const extractVtt = (mediaNode: any) => {
      if (!mediaNode) return '';
      let extractedVtt = '';
      if (mediaNode.subtitles && mediaNode.subtitles.length > 0) {
        extractedVtt = mediaNode.subtitles.find((s: any) => s.file?.url?.endsWith('.vtt'))?.file?.url || '';
      }
      if (!extractedVtt && mediaNode.files) {
        const fileWithSub = mediaNode.files.find((f: any) => f.subtitles?.url?.endsWith('.vtt'));
        if (fileWithSub) extractedVtt = fileWithSub.subtitles.url;
      }
      if (!extractedVtt && mediaNode.files) {
        const fileVtt = mediaNode.files.find((f: any) => f.progressiveDownloadURL?.endsWith('.vtt'));
        if (fileVtt) extractedVtt = fileVtt.progressiveDownloadURL;
      }
      return extractedVtt;
    };
    
    // Extract target language subtitles
    const targetVtt = extractVtt(sRes.data.media[0]);
    subtitleFiles.value = targetVtt ? [{ file: { url: targetVtt } }] : [];

    // Extract English fallback subtitles
    if (enRes?.data?.media?.[0]) {
      englishSubtitleUrl.value = extractVtt(enRes.data.media[0]);
    } else if (subLangObj.code === 'E') {
      englishSubtitleUrl.value = targetVtt;
    }

    if (availableQualities.value.length > 0 && !availableQualities.value.includes(selectedQuality.value)) {
      selectedQuality.value = availableQualities.value[0];
    }
  } catch (err) {
    console.error('API Error:', err);
    videoFiles.value = [];
    subtitleFiles.value = [];
  } finally {
    loading.value = false;
  }
};

// --- AI GENERATION LOGIC ---
const generateAiSubtitles = async () => {
  if (!videoUrl.value) return;
  
  aiLoading.value = true;
  aiStatus.value = englishSubtitleUrl.value 
    ? 'Translating English subtitles...' 
    : 'Preparing AI... (Media download & processing in progress)';
  
  try {
    const targetLocale = store.getSubtitleLanguageObj?.locale || 'en';
    
    const response = await axios.post('/api/subtitles/generate', {
      lank: selectedVideo.value?.lank,
      targetLang: targetLocale,
      audioUrl: videoUrl.value,
      subtitleUrl: englishSubtitleUrl.value || '' // Pass English VTT if available to directly translate
    });

    let vttData = response.data.vttContent || response.data.vtt || response.data.content;
    if (!vttData && typeof response.data === 'string') {
      vttData = response.data;
    }

    if (response.data.status === 'success' || vttData) {
      const blob = new Blob([vttData], { type: 'text/vtt;charset=utf-8' });
      // Create object URL and bind it to activeSubtitleUrl overriding the native one
      aiVttUrl.value = URL.createObjectURL(blob);
      showSubtitles.value = true; // Auto-enable viewing the new subtitles
      aiStatus.value = 'Success!';
      setTimeout(() => { aiStatus.value = ''; }, 3000);
    } else {
      throw new Error('Invalid AI response format');
    }
  } catch (err: any) {
    console.error('AI Generation Failed:', err);
    aiStatus.value = err.response?.data?.error || 'Generation Failed. Please check logs.';
  } finally {
    aiLoading.value = false;
  }
};

const downloadFile = (url: string, filename: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.setAttribute('target', '_blank');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- VIDEO SHARE LOGIC ---
const shareVideo = async () => {
  if (!selectedVideo.value?.lank) return;
  const langCode = store.getVideoLanguageObj?.code || 'E';
  // Use the native JW.org share URL passed from the API, or construct a robust fallback
  const shareUrl = selectedVideo.value.url || `https://www.jw.org/finder?wtlocale=${langCode}&lank=${selectedVideo.value.lank}`;

  // Try Native Web Share API first (Mobile devices & compatible browsers)
  if (navigator.share) {
    try {
      await navigator.share({
        title: selectedVideo.value.title,
        url: shareUrl
      });
      return; // Share succeeded, exit early
    } catch (err: any) {
      if (err.name === 'AbortError') return; // User closed the share sheet natively
      console.error('Native share failed, falling back to clipboard copy:', err);
    }
  }

  // Fallback: Invisible textarea for document.execCommand('copy') to bypass iframe navigator.clipboard blocks
  const textArea = document.createElement("textarea");
  textArea.value = shareUrl;
  textArea.style.position = "absolute";
  textArea.style.left = "-999999px";
  document.body.appendChild(textArea);
  textArea.select();
  
  try {
    document.execCommand("copy");
    shareVideoCopied.value = true;
    setTimeout(() => { shareVideoCopied.value = false; }, 2000);
  } catch (err) {
    console.error('Failed to copy link', err);
  } finally {
    document.body.removeChild(textArea);
  }
};

// Robust VTT Parsing and Display Logic
const openTranscript = async () => {
  if (!activeSubtitleUrl.value) return;
  loadingTranscript.value = true;
  transcriptDialog.value = true;
  transcriptCopied.value = false;
  
  try {
    const { data } = await axios.get(activeSubtitleUrl.value);
    const lines = data.split(/\r?\n/);
    const output: string[] = [];
    let i = 0;
    
    // Aggressive line-by-line cue filtering
    while (i < lines.length) {
      let line = lines[i].trim();
      // Skip Headers
      if (line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:')) { i++; continue; }
      // Skip Timestamps & inline parameters (e.g. 00:00:01.000 --> 00:00:02.000 line:90%)
      if (line.includes('-->')) { i++; continue; }
      // Skip Cue IDs (Lookahead: if the NEXT line contains a timestamp, this line is a cue ID)
      if (i + 1 < lines.length && lines[i + 1].includes('-->')) { i += 2; continue; }
      
      // Clean HTML tags and push valid text
      if (line !== '') {
        output.push(line.replace(/<[^>]+>/g, ''));
      }
      i++;
    }
    
    // Formatting: Join lines, adding newlines only after punctuation
    let combined = '';
    for (let j = 0; j < output.length; j++) {
      combined += output[j];
      if (/[.?!;]$/.test(output[j])) {
        combined += '\n\n';
      } else {
        combined += ' ';
      }
    }
    
    transcriptText.value = combined.trim();
  } catch (err) {
    transcriptText.value = 'Failed to load transcript.';
  } finally {
    loadingTranscript.value = false;
  }
};

const downloadTxt = () => {
  const blob = new Blob([transcriptText.value], { type: 'text/plain' });
  downloadFile(URL.createObjectURL(blob), `${selectedVideo.value?.title}_Transcript.txt`);
};

const copyTranscript = () => {
  const textArea = document.createElement("textarea");
  textArea.value = transcriptText.value;
  textArea.style.position = "absolute";
  textArea.style.left = "-999999px"; // Keep it off-screen
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand("copy");
    transcriptCopied.value = true;
    setTimeout(() => { transcriptCopied.value = false; }, 2000);
  } catch (err) {
    console.error('Failed to copy text', err);
  } finally {
    document.body.removeChild(textArea);
  }
};

watch(playbackRate, (newRate) => {
  if (videoPlayer.value) {
    videoPlayer.value.playbackRate = newRate;
  }
});

watch([selectedVideo, videoLang, subtitleLang], fetchVideoData);

watch([showSubtitles, activeSubtitleUrl, videoUrl], () => {
  nextTick(() => { setTimeout(enforceSubtitles, 150); });
});

const close = () => {
  if (videoPlayer.value) {
    saveTime();
    videoPlayer.value.pause();
  }
  dialog.value = false;
  playbackRate.value = 1.0; // Reset speed on close
  isTheatreMode.value = false; // Reset theatre mode on close
};
</script>

<template>
  <!-- Dynamic Styles for Native Subtitles -->
  <component :is="'style'">
    video::cue {
      color: {{ subColor }} !important;
      background-color: rgba(0, 0, 0, {{ subBgAlpha }}) !important;
      font-size: calc({{ subFontSize }}% * 1.5) !important;
      font-family: {{ subFontFamily }} !important;
    }
  </component>

  <v-dialog v-model="dialog" max-width="1000" persistent transition="dialog-bottom-transition" :fullscreen="isTheatreMode">
    <v-card v-if="selectedVideo" :rounded="isTheatreMode ? '0' : 'xl'" :color="isTheatreMode ? 'black' : undefined">
      <v-toolbar color="primary" v-show="!isTheatreMode">
        <v-toolbar-title class="text-truncate">{{ selectedVideo.title }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <!-- Theatre Mode Icon -->
        <v-btn icon="mdi-fit-to-screen" variant="text" @click="isTheatreMode = true" title="Theatre Mode"></v-btn>
        <!-- Share Link Icon -->
        <v-btn 
          :icon="shareVideoCopied ? 'mdi-check' : 'mdi-share-variant'" 
          variant="text" 
          @click="shareVideo" 
          :title="shareVideoCopied ? 'Copied!' : 'Share Video'"
        ></v-btn>
        <!-- Subtitle Settings Icon -->
        <v-btn icon="mdi-format-size" variant="text" @click="subtitleStyleDialog = true" title="Subtitle Style Settings"></v-btn>
        <v-btn icon="mdi-close" variant="text" @click="close"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-0">
        <div class="bg-black text-center d-flex flex-column justify-center align-center position-relative" :style="isTheatreMode ? 'height: 100vh;' : 'min-height: 400px;'">
          <!-- Theatre Mode Exit Button -->
          <v-btn 
            v-if="isTheatreMode" 
            icon="mdi-fullscreen-exit" 
            variant="tonal" 
            color="white" 
            style="position: absolute; top: 16px; right: 16px; z-index: 10;" 
            @click="isTheatreMode = false" 
            title="Exit Theatre Mode"
          ></v-btn>

          <!-- Bound @timeupdate and @loadeddata to enable video persistence -->
          <video 
            v-if="videoUrl" 
            ref="videoPlayer" 
            @loadeddata="onVideoLoaded" 
            @timeupdate="saveTime"
            controls 
            crossorigin="anonymous" 
            class="w-100" 
            :style="isTheatreMode ? 'max-height: 100vh; height: 100%; object-fit: contain;' : 'max-height: 60vh;'"
            :src="videoUrl" 
            :poster="selectedVideo.images?.lsr?.lg"
          >
            <track v-if="activeSubtitleUrl" :key="activeSubtitleUrl" kind="captions" :src="activeSubtitleUrl" :srclang="subtitleLang" :label="store.getSubtitleLanguageObj?.name" default />
          </video>
          <div v-else-if="loading" class="pa-16"><v-progress-circular indeterminate color="primary"></v-progress-circular></div>
          <div v-else class="pa-16 text-white">
            <v-icon color="error" size="48" class="mb-4">mdi-alert-circle-outline</v-icon>
            <div class="text-h6">Video unavailable</div>
          </div>
        </div>

        <v-container v-show="!isTheatreMode">
          <v-row align="center">
            <v-col cols="6" sm="3">
              <v-autocomplete v-model="videoLang" :items="store.languages" item-title="name" item-value="locale" label="Audio" prepend-inner-icon="mdi-volume-high" variant="outlined" density="compact" hide-details></v-autocomplete>
            </v-col>
            <v-col cols="6" sm="2">
              <v-select v-model="selectedQuality" :items="availableQualities" label="Quality" prepend-inner-icon="mdi-high-definition" variant="outlined" density="compact" hide-details></v-select>
            </v-col>
            <v-col cols="6" sm="2">
              <v-select v-model="playbackRate" :items="playbackRates" item-title="title" item-value="value" label="Speed" prepend-inner-icon="mdi-play-speed" variant="outlined" density="compact" hide-details></v-select>
            </v-col>
            <v-col cols="6" sm="3">
              <v-autocomplete v-model="subtitleLang" :items="store.languages" item-title="name" item-value="locale" label="Subtitles" prepend-inner-icon="mdi-subtitles" variant="outlined" density="compact" hide-details></v-autocomplete>
            </v-col>
            <v-col cols="12" sm="2" class="d-flex justify-center">
              <v-switch v-model="showSubtitles" label="CC" color="primary" hide-details density="compact" :disabled="!activeSubtitleUrl"></v-switch>
            </v-col>
          </v-row>

          <!-- AI Generation Alert conditionally displayed based on native subtitle absence -->
          <v-alert v-if="!nativeSubtitleUrl && !aiVttUrl && !loading" border="start" color="deep-purple-accent-4" variant="tonal" class="mt-4 py-2 px-4">
            <div class="d-flex align-center justify-space-between">
              <div>
                <strong class="text-subtitle-2">AI Subtitles & Translation</strong>
                <div class="text-caption">{{ aiStatus || (englishSubtitleUrl ? 'Translate existing English subtitles via AI.' : 'Generate subtitles from audio & translate via AI.') }}</div>
              </div>
              <v-btn color="deep-purple-accent-4" variant="flat" size="small" :loading="aiLoading" @click="generateAiSubtitles">
                {{ englishSubtitleUrl ? 'Translate' : 'Generate' }}
              </v-btn>
            </div>
          </v-alert>
          
          <p class="text-body-1 mt-6">{{ selectedVideo.description }}</p>
        </v-container>
      </v-card-text>

      <v-divider v-show="!isTheatreMode"></v-divider>

      <v-card-actions class="pa-4 flex-wrap gap-2" v-show="!isTheatreMode">
        <v-btn color="primary" variant="flat" prepend-icon="mdi-cast" :href="smPlayerUrl" target="_blank" class="rounded-lg" :disabled="!videoUrl">Chromecast</v-btn>
        
        <v-menu v-if="videoFiles.length > 0">
          <template v-slot:activator="{ props }">
            <v-btn color="secondary" variant="outlined" prepend-icon="mdi-download" v-bind="props" class="rounded-lg" :disabled="!videoUrl">Video</v-btn>
          </template>
          <v-list>
            <v-list-item v-for="file in videoFiles" :key="file.label" @click="downloadFile(file.progressiveDownloadURL, `${selectedVideo.title}_${file.label}.mp4`)">
              <v-list-item-title>Download {{ file.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        
        <v-menu v-if="activeSubtitleUrl">
          <template v-slot:activator="{ props }">
            <v-btn color="grey-darken-2" variant="outlined" prepend-icon="mdi-file-download" v-bind="props" class="rounded-lg">Subtitles</v-btn>
          </template>
          <v-list>
            <v-list-item @click="downloadFile(activeSubtitleUrl, `${selectedVideo?.title}.vtt`)">
              <v-list-item-title>Download VTT</v-list-item-title>
            </v-list-item>
            <v-list-item @click="openTranscript">
              <v-list-item-title>View Transcript (TXT)</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-spacer></v-spacer>
        <v-btn variant="text" @click="close">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Subtitle Style Settings Dialog -->
  <v-dialog v-model="subtitleStyleDialog" max-width="400">
    <v-card rounded="xl">
      <v-card-title class="bg-primary text-white">Subtitle Styles</v-card-title>
      <v-card-text class="pa-6">
        <div class="mb-4">
          <div class="text-subtitle-2 mb-2">Font Family</div>
          <v-select v-model="subFontFamily" :items="presetFonts" item-title="text" item-value="value" variant="outlined" density="compact" hide-details></v-select>
        </div>
        <div class="mb-4">
          <div class="text-subtitle-2 mb-2">Font Size ({{ subFontSize }}%)</div>
          <v-slider v-model="subFontSize" min="50" max="300" step="10" color="primary" hide-details></v-slider>
        </div>
        <div class="mb-4">
          <div class="text-subtitle-2 mb-2">Background Opacity ({{ subBgAlpha }})</div>
          <v-slider v-model="subBgAlpha" min="0" max="1" step="0.1" color="primary" hide-details></v-slider>
        </div>
        <div>
          <div class="text-subtitle-2 mb-2">Text Color</div>
          <v-select v-model="subColor" :items="presetColors" item-title="text" item-value="value" variant="outlined" density="compact" hide-details></v-select>
        </div>
      </v-card-text>
      <v-card-actions class="pa-4">
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="text" @click="subtitleStyleDialog = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Transcript Viewer Dialog -->
  <v-dialog v-model="transcriptDialog" max-width="700" scrollable>
    <v-card rounded="xl" style="max-height: 80vh;">
      <v-toolbar color="primary" class="flex-grow-0">
        <v-toolbar-title>Transcript</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="transcriptDialog = false"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-6 bg-grey-lighten-4 text-body-1" style="white-space: pre-wrap; line-height: 1.6;">
        <div v-if="loadingTranscript" class="text-center pa-10">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>
        <div v-else>{{ transcriptText }}</div>
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions class="pa-4">
        <v-btn color="primary" prepend-icon="mdi-download" @click="downloadTxt">Download TXT</v-btn>
        <!-- Copy to Clipboard Button -->
        <v-btn 
          color="secondary" 
          :prepend-icon="transcriptCopied ? 'mdi-check' : 'mdi-content-copy'" 
          @click="copyTranscript"
        >
          {{ transcriptCopied ? 'Copied!' : 'Copy' }}
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="transcriptDialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>