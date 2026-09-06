<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import axios from 'axios';
import { mediatorService, extractSubtitleVtt } from '@/services/mediatorService';
import { subtitleService, blobUrlManager, buildChromecastUrl } from '@/services/subtitleService';

const store = useAppStore();
const { t } = useI18n();

const videoFiles = ref<any[]>([]);
const subtitleFiles = ref<any[]>([]);
const englishSubtitleUrl = ref('');
const loading = ref(false);
const videoPlayer = ref<HTMLVideoElement | null>(null);
const selectedQuality = ref('720p');
const showSubtitles = ref(true);

// Theatre Mode State
const isTheatreMode = ref(false);
const showTheatreControls = ref(false);

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

const smPlayerUrl = computed(() => {
  return buildChromecastUrl(
    videoUrl.value,
    selectedVideo.value?.title || '',
    activeSubtitleUrl.value || undefined
  );
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
  if (aiVttUrl.value) {
    blobUrlManager.revoke(aiVttUrl.value);
    aiVttUrl.value = '';
  }
  aiStatus.value = '';
  englishSubtitleUrl.value = ''; // Reset fallback
  
  try {
    const videoLangObj = store.getVideoLanguageObj || { code: 'E' };
    const subLangObj = store.getSubtitleLanguageObj || { code: 'F' };
    
    const requests: Promise<any>[] = [
      mediatorService.fetchMediaItem(selectedVideo.value.lank, videoLangObj.code, store.mediatorUrl),
      mediatorService.fetchMediaItem(selectedVideo.value.lank, subLangObj.code, store.mediatorUrl)
    ];

    // Fetch English fallback if the selected subtitle language is not already English
    if (subLangObj.code !== 'E') {
      requests.push(
        mediatorService.fetchMediaItem(selectedVideo.value.lank, 'E', store.mediatorUrl).catch(() => null)
      );
    }
    
    const responses = await Promise.all(requests);
    const vNode = responses[0];
    const sNode = responses[1];
    const enNode = responses.length > 2 ? responses[2] : null;
    
    videoFiles.value = vNode?.files || [];
    
    // Extract target language subtitles
    const targetVtt = extractSubtitleVtt(sNode);
    subtitleFiles.value = targetVtt ? [{ file: { url: targetVtt } }] : [];

    // Extract English fallback subtitles
    if (enNode) {
      englishSubtitleUrl.value = extractSubtitleVtt(enNode);
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
    ? t('ai.translating')
    : t('ai.preparing');
  
  try {
    const targetLocale = store.getSubtitleLanguageObj?.locale || 'en';
    const sourceLocale = store.getVideoLanguageObj?.locale || 'en';
    
    const res = await subtitleService.generateAiSubtitles({
      lank: selectedVideo.value?.lank || '',
      targetLang: targetLocale,
      sourceLang: sourceLocale,
      audioUrl: videoUrl.value,
      subtitleUrl: englishSubtitleUrl.value || undefined
    });

    let vttData = res.vttContent || (res as any).vtt || (res as any).content;
    if (!vttData && typeof res === 'string') {
      vttData = res;
    }

    if (res.status === 'success' || vttData) {
      if (aiVttUrl.value) {
        blobUrlManager.revoke(aiVttUrl.value);
      }
      aiVttUrl.value = blobUrlManager.create(vttData, 'text/vtt;charset=utf-8');
      showSubtitles.value = true;
      aiStatus.value = t('ai.success');
      setTimeout(() => { aiStatus.value = ''; }, 3000);
    } else {
      throw new Error('Invalid AI response format');
    }
  } catch (err: any) {
    console.error('AI Generation Failed:', err);
    if (!err.response) {
      aiStatus.value = (err.message && (err.message.includes('Network') || err.message.includes('timeout'))) || err.code === 'ECONNREFUSED'
        ? t('ai.serverUnreachable')
        : (err.message || t('ai.failed'));
    } else {
      aiStatus.value = err.response?.data?.error || t('ai.failed');
    }
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

// Robust Clipboard Helper
const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Clipboard writeText failed, trying fallback', err);
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch (e) {
    console.error('Copy fallback failed', e);
  }
  document.body.removeChild(textArea);
  return success;
};

// --- VIDEO SHARE LOGIC ---
const shareVideo = async () => {
  if (!selectedVideo.value?.lank) return;
  const langCode = store.getVideoLanguageObj?.code || 'E';
  const shareUrl = selectedVideo.value.url || `https://www.jw.org/finder?wtlocale=${langCode}&lank=${selectedVideo.value.lank}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: selectedVideo.value.title,
        url: shareUrl
      });
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Native share failed, falling back to clipboard copy:', err);
    }
  }

  const ok = await copyToClipboard(shareUrl);
  if (ok) {
    shareVideoCopied.value = true;
    setTimeout(() => { shareVideoCopied.value = false; }, 2000);
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
    transcriptText.value = subtitleService.parseVttToText(data);
  } catch (err) {
    transcriptText.value = 'Failed to load transcript.';
  } finally {
    loadingTranscript.value = false;
  }
};

const downloadTxt = () => {
  subtitleService.downloadTextFile(transcriptText.value, `${selectedVideo.value?.title}_Transcript.txt`);
};

const copyTranscript = async () => {
  const ok = await copyToClipboard(transcriptText.value);
  if (ok) {
    transcriptCopied.value = true;
    setTimeout(() => { transcriptCopied.value = false; }, 2000);
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
  if (aiVttUrl.value) {
    blobUrlManager.revoke(aiVttUrl.value);
    aiVttUrl.value = '';
  }
  dialog.value = false;
  playbackRate.value = 1.0;
  isTheatreMode.value = false;
};

onBeforeUnmount(() => {
  if (aiVttUrl.value) {
    blobUrlManager.revoke(aiVttUrl.value);
  }
});
</script>

<template>
  <v-dialog v-model="dialog" max-width="1000" persistent transition="dialog-bottom-transition" :fullscreen="isTheatreMode">
    <v-card v-if="selectedVideo" :rounded="isTheatreMode ? '0' : 'xl'" :color="isTheatreMode ? 'black' : undefined">
      <v-toolbar color="primary" v-show="!isTheatreMode">
        <v-toolbar-title class="text-truncate">{{ selectedVideo.title }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <!-- Theatre Mode Icon -->
        <v-btn icon="mdi-fit-to-screen" variant="text" @click="isTheatreMode = true" :title="$t('player.theatreMode')" :aria-label="$t('player.theatreMode')"></v-btn>
        <!-- Share Link Icon -->
        <v-btn 
          :icon="shareVideoCopied ? 'mdi-check' : 'mdi-share-variant'" 
          variant="text" 
          @click="shareVideo" 
          :title="shareVideoCopied ? $t('player.copied') : $t('player.share')"
          :aria-label="$t('player.share')"
        ></v-btn>
        <!-- Subtitle Settings Icon -->
        <v-btn icon="mdi-format-size" variant="text" @click="subtitleStyleDialog = true" :title="$t('styles.title')" :aria-label="$t('styles.title')"></v-btn>
        <v-btn icon="mdi-close" variant="text" @click="close" :title="$t('player.close')" :aria-label="$t('player.close')"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-0">
        <div 
          class="bg-black text-center d-flex flex-column justify-center align-center position-relative video-wrapper" 
          :style="{
            height: isTheatreMode ? '100vh' : undefined,
            minHeight: !isTheatreMode ? '400px' : undefined,
            '--sub-color': subColor,
            '--sub-bg-color': `rgba(0, 0, 0, ${subBgAlpha})`,
            '--sub-font-size': `calc(${subFontSize}% * 1.5)`,
            '--sub-font-family': subFontFamily
          }"
          @mouseenter="showTheatreControls = true"
          @mouseleave="showTheatreControls = false"
        >
          <!-- Theatre Mode Overlay Top Bar -->
          <div 
            v-if="isTheatreMode" 
            class="theatre-overlay d-flex align-center justify-space-between px-6 py-3 transition-swing"
            :class="{ 'theatre-overlay-visible': showTheatreControls }"
          >
            <div class="text-white text-subtitle-1 font-weight-bold text-truncate" style="max-width: 60%;">
              {{ selectedVideo.title }}
            </div>
            <div class="d-flex align-center gap-2">
              <v-btn icon="mdi-format-size" variant="tonal" color="white" size="small" @click="subtitleStyleDialog = true" :title="$t('styles.title')"></v-btn>
              <v-btn 
                icon="mdi-fullscreen-exit" 
                variant="tonal" 
                color="white" 
                size="small"
                @click="isTheatreMode = false" 
                :title="$t('player.exitTheatreMode')"
              ></v-btn>
            </div>
          </div>

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
            <div class="text-h6">{{ $t('player.unavailable') }}</div>
          </div>
        </div>

        <v-container v-show="!isTheatreMode">
          <v-row align="center">
            <v-col cols="6" sm="3">
              <v-autocomplete v-model="videoLang" :items="store.languages" item-title="name" item-value="locale" :label="$t('player.audio')" prepend-inner-icon="mdi-volume-high" variant="outlined" density="compact" hide-details></v-autocomplete>
            </v-col>
            <v-col cols="6" sm="2">
              <v-select v-model="selectedQuality" :items="availableQualities" :label="$t('player.quality')" prepend-inner-icon="mdi-high-definition" variant="outlined" density="compact" hide-details></v-select>
            </v-col>
            <v-col cols="6" sm="2">
              <v-select v-model="playbackRate" :items="playbackRates" item-title="title" item-value="value" :label="$t('player.speed')" prepend-inner-icon="mdi-play-speed" variant="outlined" density="compact" hide-details></v-select>
            </v-col>
            <v-col cols="6" sm="3">
              <v-autocomplete v-model="subtitleLang" :items="store.languages" item-title="name" item-value="locale" :label="$t('player.subtitles')" prepend-inner-icon="mdi-subtitles" variant="outlined" density="compact" hide-details></v-autocomplete>
            </v-col>
            <v-col cols="12" sm="2" class="d-flex justify-center">
              <v-switch v-model="showSubtitles" :label="$t('player.cc')" color="primary" hide-details density="compact" :disabled="!activeSubtitleUrl"></v-switch>
            </v-col>
          </v-row>

          <!-- AI Generation Alert conditionally displayed based on native subtitle absence -->
          <v-alert v-if="store.aiEnabled && !nativeSubtitleUrl && !aiVttUrl && !loading" border="start" color="deep-purple-accent-4" variant="tonal" class="mt-4 py-2 px-4">
            <div class="d-flex align-center justify-space-between">
              <div>
                <strong class="text-subtitle-2">{{ $t('ai.title') }}</strong>
                <div class="text-caption">{{ aiStatus || (englishSubtitleUrl ? $t('ai.translateExisting') : $t('ai.generateFromAudio')) }}</div>
              </div>
              <v-btn color="deep-purple-accent-4" variant="flat" size="small" :loading="aiLoading" @click="generateAiSubtitles">
                {{ englishSubtitleUrl ? $t('ai.translate') : $t('ai.generate') }}
              </v-btn>
            </div>
          </v-alert>

          <!-- Notice when AI subtitles are disabled because GROQ_API_KEY is not set -->
          <v-alert v-else-if="!store.aiEnabled && !nativeSubtitleUrl && !loading" border="start" color="grey" variant="tonal" class="mt-4 py-2 px-4">
            <div class="d-flex align-center">
              <v-icon size="18" color="grey" class="mr-2">mdi-information-outline</v-icon>
              <span class="text-caption text-grey-lighten-1">{{ $t('ai.disabledNotice') }}</span>
            </div>
          </v-alert>
          
          <p class="text-body-1 mt-6">{{ selectedVideo.description }}</p>
        </v-container>
      </v-card-text>

      <v-divider v-show="!isTheatreMode"></v-divider>

      <v-card-actions class="pa-4 flex-wrap gap-2" v-show="!isTheatreMode">
        <v-btn color="primary" variant="flat" prepend-icon="mdi-cast" :href="smPlayerUrl" target="_blank" class="rounded-lg" :disabled="!videoUrl">{{ $t('player.chromecast') }}</v-btn>
        
        <v-menu v-if="videoFiles.length > 0">
          <template v-slot:activator="{ props }">
            <v-btn color="secondary" variant="outlined" prepend-icon="mdi-download" v-bind="props" class="rounded-lg" :disabled="!videoUrl">{{ $t('player.downloadVideo') }}</v-btn>
          </template>
          <v-list>
            <v-list-item v-for="file in videoFiles" :key="file.label" @click="downloadFile(file.progressiveDownloadURL, `${selectedVideo.title}_${file.label}.mp4`)">
              <v-list-item-title>Download {{ file.label }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        
        <v-menu v-if="activeSubtitleUrl">
          <template v-slot:activator="{ props }">
            <v-btn color="grey-darken-2" variant="outlined" prepend-icon="mdi-file-download" v-bind="props" class="rounded-lg">{{ $t('player.downloadSubtitles') }}</v-btn>
          </template>
          <v-list>
            <v-list-item @click="downloadFile(activeSubtitleUrl, `${selectedVideo?.title}.vtt`)">
              <v-list-item-title>{{ $t('player.downloadVtt') }}</v-list-item-title>
            </v-list-item>
            <v-list-item @click="openTranscript">
              <v-list-item-title>{{ $t('player.viewTranscript') }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-spacer></v-spacer>
        <v-btn variant="text" @click="close">{{ $t('player.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Subtitle Style Settings Dialog -->
  <v-dialog v-model="subtitleStyleDialog" max-width="400">
    <v-card rounded="xl">
      <v-card-title class="bg-primary text-white">{{ $t('styles.title') }}</v-card-title>
      <v-card-text class="pa-6">
        <div class="mb-4">
          <div class="text-subtitle-2 mb-2">{{ $t('styles.fontFamily') }}</div>
          <v-select v-model="subFontFamily" :items="presetFonts" item-title="text" item-value="value" variant="outlined" density="compact" hide-details></v-select>
        </div>
        <div class="mb-4">
          <div class="text-subtitle-2 mb-2">{{ $t('styles.fontSize', { size: subFontSize }) }}</div>
          <v-slider v-model="subFontSize" min="50" max="300" step="10" color="primary" hide-details></v-slider>
        </div>
        <div class="mb-4">
          <div class="text-subtitle-2 mb-2">{{ $t('styles.bgOpacity', { opacity: subBgAlpha }) }}</div>
          <v-slider v-model="subBgAlpha" min="0" max="1" step="0.1" color="primary" hide-details></v-slider>
        </div>
        <div>
          <div class="text-subtitle-2 mb-2">{{ $t('styles.textColor') }}</div>
          <v-select v-model="subColor" :items="presetColors" item-title="text" item-value="value" variant="outlined" density="compact" hide-details></v-select>
        </div>
      </v-card-text>
      <v-card-actions class="pa-4">
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="text" @click="subtitleStyleDialog = false">{{ $t('styles.done') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Transcript Viewer Dialog -->
  <v-dialog v-model="transcriptDialog" max-width="700" scrollable>
    <v-card rounded="xl" style="max-height: 80vh;">
      <v-toolbar color="primary" class="flex-grow-0">
        <v-toolbar-title>{{ $t('transcript.title') }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="transcriptDialog = false" :aria-label="$t('player.close')"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-6 bg-grey-lighten-4 text-body-1" style="white-space: pre-wrap; line-height: 1.6;">
        <div v-if="loadingTranscript" class="text-center pa-10">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>
        <div v-else>{{ transcriptText }}</div>
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions class="pa-4">
        <v-btn color="primary" prepend-icon="mdi-download" @click="downloadTxt">{{ $t('transcript.downloadTxt') }}</v-btn>
        <!-- Copy to Clipboard Button -->
        <v-btn 
          color="secondary" 
          :prepend-icon="transcriptCopied ? 'mdi-check' : 'mdi-content-copy'" 
          @click="copyTranscript"
        >
          {{ transcriptCopied ? $t('player.copied') : $t('transcript.copy') }}
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="transcriptDialog = false">{{ $t('player.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.video-wrapper video::cue {
  color: var(--sub-color) !important;
  background-color: var(--sub-bg-color) !important;
  font-size: var(--sub-font-size) !important;
  font-family: var(--sub-font-family) !important;
}

.theatre-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.theatre-overlay-visible {
  opacity: 1;
  pointer-events: auto;
}
</style>