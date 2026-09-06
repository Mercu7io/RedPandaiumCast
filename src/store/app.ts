import { defineStore } from 'pinia';
import { Language, Translations, Video } from '@/types';

const LS_VIDEO_LANG = 'jwcast_video_lang';
const LS_SUB_LANG = 'jwcast_sub_lang';

export const useAppStore = defineStore('app', {
  state: () => ({
    languages: [] as Language[],
    translations: {} as Translations,
    siteLanguage: 'en',
    videoLanguage: typeof localStorage !== 'undefined' ? localStorage.getItem(LS_VIDEO_LANG) || 'en' : 'en',
    subtitleLanguage: typeof localStorage !== 'undefined' ? localStorage.getItem(LS_SUB_LANG) || 'fr' : 'fr',
    searchDialog: false,
    videoDialog: false,
    selectedVideo: null as Video | null,
    aiEnabled: true,
    mediatorUrl: 'https://b.jw-cdn.org/apis/mediator/v1',
    tokenUrl: 'https://b.jw-cdn.org/tokens/jworg',
    searchUrl: 'https://b.jw-cdn.org/search/api/v1',
  }),
  getters: {
    getSiteLanguageObj: (state) => state.languages.find(l => l.locale === state.siteLanguage),
    getVideoLanguageObj: (state) => state.languages.find(l => l.locale === state.videoLanguage),
    getSubtitleLanguageObj: (state) => state.languages.find(l => l.locale === state.subtitleLanguage),
    findLanguageByCode: (state) => (code: string | undefined) => state.languages.find(l => l.code === code),
    findLanguageByLocale: (state) => (locale: string | undefined) => state.languages.find(l => l.locale === locale?.replace('-', '_')),
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
    setVideoDialog(val: boolean) { this.videoDialog = val; },
    setSearchDialog(val: boolean) { this.searchDialog = val; },
    setSelectedVideo(video: Video | null) { this.selectedVideo = video; },
    setAiEnabled(val: boolean) { this.aiEnabled = val; }
  },
});