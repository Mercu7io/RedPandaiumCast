import { defineStore } from 'pinia';
import { Language, Translations, Video } from '@/types';

const LS_VIDEO_LANG = 'jwcast_video_lang';
const LS_SUB_LANG = 'jwcast_sub_lang';

export const useAppStore = defineStore('app', {
  state: () => ({
    languages: [] as Language[],
    translations: {} as Translations,
    siteLanguage: 'en',
    videoLanguage: localStorage.getItem(LS_VIDEO_LANG) || 'en',
    subtitleLanguage: localStorage.getItem(LS_SUB_LANG) || 'fr',
    searchDialog: false,
    videoDialog: false,
    getNotifiedDialog: false,
    selectedVideo: null as Video | null,
    // BUGFIX: Added missing '/apis/' to the mediator base URL
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
      localStorage.setItem(LS_VIDEO_LANG, lang);
    },
    setSubtitleLanguage(lang: string) { 
      this.subtitleLanguage = lang;
      localStorage.setItem(LS_SUB_LANG, lang);
    },
    setVideoDialog(val: boolean) { this.videoDialog = val; },
    setSearchDialog(val: boolean) { this.searchDialog = val; },
    setGetNotifiedDialog(val: boolean) { this.getNotifiedDialog = val; },
    setSelectedVideo(video: Video | null) { this.selectedVideo = video; }
  },
});