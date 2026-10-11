import { defineStore } from 'pinia';
import { Language, Translations, Video, PlaybackHistoryItem, ThemeMode } from '@/types';

const LS_VIDEO_LANG = 'jwcast_video_lang';
const LS_SUB_LANG = 'jwcast_sub_lang';
const LS_THEME_MODE = 'jwcast_theme_mode';
const LS_HISTORY = 'jwcast_playback_history';
const LS_FAVORITES = 'jwcast_favorites';

const getInitialHistory = (): PlaybackHistoryItem[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const getInitialFavorites = (): Video[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_FAVORITES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const useAppStore = defineStore('app', {
  state: () => ({
    languages: [] as Language[],
    translations: {} as Translations,
    siteLanguage: 'en',
    videoLanguage: typeof localStorage !== 'undefined' ? localStorage.getItem(LS_VIDEO_LANG) || 'en' : 'en',
    subtitleLanguage: typeof localStorage !== 'undefined' ? localStorage.getItem(LS_SUB_LANG) || 'fr' : 'fr',
    themeMode: (typeof localStorage !== 'undefined' ? (localStorage.getItem(LS_THEME_MODE) as ThemeMode) || 'dark' : 'dark') as ThemeMode,
    systemPrefersDark: typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true,
    searchDialog: false,
    videoDialog: false,
    selectedVideo: null as Video | null,
    aiEnabled: true,
    mediatorUrl: 'https://b.jw-cdn.org/apis/mediator/v1',
    tokenUrl: 'https://b.jw-cdn.org/tokens/jworg',
    searchUrl: 'https://b.jw-cdn.org/search/api/v1',
    playbackHistory: getInitialHistory(),
    favorites: getInitialFavorites(),
  }),
  getters: {
    getSiteLanguageObj: (state) => state.languages.find(l => l.locale === state.siteLanguage),
    getVideoLanguageObj: (state) => state.languages.find(l => l.locale === state.videoLanguage),
    getSubtitleLanguageObj: (state) => state.languages.find(l => l.locale === state.subtitleLanguage),
    findLanguageByCode: (state) => (code: string | undefined) => state.languages.find(l => l.code === code),
    findLanguageByLocale: (state) => (locale: string | undefined) => state.languages.find(l => l.locale === locale?.replace('-', '_')),
    effectiveTheme: (state): 'dark' | 'light' => {
      if (state.themeMode === 'system') {
        return state.systemPrefersDark ? 'dark' : 'light';
      }
      return state.themeMode === 'light' ? 'light' : 'dark';
    },
    isFavorite: (state) => (lank: string) => {
      return state.favorites.some(f => f.lank === lank);
    },
  },
  actions: {
    setLanguages(langs: Language[]) { this.languages = langs; },
    setTranslations(trans: Translations) { this.translations = trans; },
    setSiteLanguage(lang: string) { this.siteLanguage = lang; },
    setVideoLanguage(lang: string) { 
      this.videoLanguage = lang;
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS_VIDEO_LANG, lang);
    },
    setSubtitleLanguage(lang: string) { 
      this.subtitleLanguage = lang;
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS_SUB_LANG, lang);
    },
    setThemeMode(mode: ThemeMode) {
      this.themeMode = mode;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_THEME_MODE, mode);
      }
      this.applyThemeToDom();
    },
    initTheme() {
      if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemPrefersDark = mediaQuery.matches;
        mediaQuery.addEventListener('change', (e) => {
          this.systemPrefersDark = e.matches;
          this.applyThemeToDom();
        });
      }
      this.applyThemeToDom();
    },
    applyThemeToDom() {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', this.effectiveTheme);
      }
    },
    setVideoDialog(val: boolean) { this.videoDialog = val; },
    setSearchDialog(val: boolean) { this.searchDialog = val; },
    setSelectedVideo(video: Video | null) { this.selectedVideo = video; },
    setAiEnabled(val: boolean) { this.aiEnabled = val; },

    // Playback History
    recordPlayback(video: Video, time: number, duration: number) {
      if (!video?.lank || time <= 0) return;
      // Filter out if within 5s of end (video completed)
      const isCompleted = duration > 0 && time >= duration - 5;
      const filtered = this.playbackHistory.filter(h => h.video.lank !== video.lank);
      if (!isCompleted) {
        filtered.unshift({
          video,
          time,
          duration,
          updatedAt: Date.now()
        });
      }
      // Keep max 20 recent items
      this.playbackHistory = filtered.slice(0, 20);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(LS_HISTORY, JSON.stringify(this.playbackHistory));
        } catch (_) {}
      }
    },
    removePlaybackHistory(lank: string) {
      this.playbackHistory = this.playbackHistory.filter(h => h.video.lank !== lank);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(LS_HISTORY, JSON.stringify(this.playbackHistory));
        } catch (_) {}
      }
    },
    clearPlaybackHistory() {
      this.playbackHistory = [];
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LS_HISTORY);
      }
    },

    // Favorites
    toggleFavorite(video: Video) {
      if (!video?.lank) return;
      const index = this.favorites.findIndex(f => f.lank === video.lank);
      if (index !== -1) {
        this.favorites.splice(index, 1);
      } else {
        this.favorites.unshift(video);
      }
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(LS_FAVORITES, JSON.stringify(this.favorites));
        } catch (_) {}
      }
    },
  },
});