<script setup lang="ts" name="App">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { useI18n } from 'vue-i18n';

import { useAppStore } from '@/store/app';
import { mediatorService } from '@/services/mediatorService';
import { openChromecastForVideo } from '@/services/subtitleService';
import { setAppLocale } from '@/i18n';
import { Video } from '@/types';
import axios from 'axios';

import VideoCategory from '@/components/VideoCategory.vue';
import VideoDialog from '@/components/VideoDialog.vue';
import SearchDialog from '@/components/SearchDialog.vue';
import HeroSpotlight from '@/components/HeroSpotlight.vue';
import CategoryPills from '@/components/CategoryPills.vue';
import HelpDialog from '@/components/HelpDialog.vue';

const helpDialog = ref(false);

// --- AUTHENTICATION LOGIC ---
const validPin = (import.meta.env.VITE_APP_PIN || '1234').toString();
const isAuthenticated = ref(localStorage.getItem('jwcast_auth') === 'true');
const pinInput = ref('');
const pinError = ref(false);

const appendPin = (digit: string) => {
  if (pinInput.value.length < 4) {
    pinInput.value += digit;
  }
  pinError.value = false;
};

const clearPin = () => {
  pinInput.value = '';
  pinError.value = false;
};

const checkPin = () => {
  if (pinInput.value === validPin) {
    isAuthenticated.value = true;
    localStorage.setItem('jwcast_auth', 'true');
  } else {
    pinError.value = true;
    pinInput.value = '';
  }
};

watch(pinInput, (val) => {
  if (val.length === 4) {
    setTimeout(checkPin, 150);
  }
});

// --- APP & NAVIGATION LOGIC ---
const store = useAppStore();
const route = useRoute();
const router = useRouter();
const theme = useTheme();
const { t } = useI18n();

const selectedCategory = ref('all');

const fetchLanguages = async () => {
  try {
    const sorted = await mediatorService.fetchLanguages(store.mediatorUrl);
    store.setLanguages(sorted);
  } catch (error) {
    console.error('Failed to fetch languages:', error);
  }
};

const fetchTranslations = async () => {
  try {
    const langObj = store.getSiteLanguageObj || { code: 'E' };
    const translations = await mediatorService.fetchTranslations(langObj.code, store.mediatorUrl);
    store.setTranslations(translations);
  } catch (error) {
    console.error('Failed to fetch translations:', error);
  }
};

// Global Ctrl+K Shortcut for Search
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    store.setSearchDialog(true);
  }
};

watch(() => route.params.language, async (newLang) => {
  if (newLang && typeof newLang === 'string') {
    if (!store.languages.some(l => l.locale === newLang)) {
      store.setSiteLanguage('en');
      setAppLocale('en');
      router.push({ name: 'Home', params: { language: 'en' } });
    } else {
      store.setSiteLanguage(newLang);
      setAppLocale(newLang);
    }
  }
});

watch(() => store.siteLanguage, async (newLang) => {
  setAppLocale(newLang);
  await fetchTranslations();
  if (route.params.language !== store.siteLanguage) {
    router.push({ name: 'Home', params: { language: store.siteLanguage } });
  }
});

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);

  await fetchLanguages();
  if (route.params.language) {
    store.setSiteLanguage(route.params.language as string);
    setAppLocale(route.params.language as string);
  } else {
    setAppLocale(store.siteLanguage);
  }
  await fetchTranslations();

  try {
    const { data } = await axios.get('/api/health');
    if (typeof data?.aiEnabled === 'boolean') {
      store.setAiEnabled(data.aiEnabled);
    }
  } catch (_) {}
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

const translations = computed(() => store.translations);
const languages = computed(() => store.languages);
const siteLanguage = computed({
  get: () => store.siteLanguage,
  set: (val) => store.setSiteLanguage(val)
});

const guideButtonText = computed(() => {
  return store.translations.lnkHelpView || t('nav.guide');
});

const onHeroAction = (video: Video) => {
  store.setSelectedVideo(video);
  store.setVideoDialog(true);
};

const onHeroCast = async (video: Video) => {
  const langObj = store.getSiteLanguageObj || { code: 'E' };
  const subLangObj = store.getSubtitleLanguageObj || { code: 'F' };
  await openChromecastForVideo(video, langObj.code, subLangObj.code, store.mediatorUrl);
};
</script>

<template>
  <v-app theme="dark">
    <!-- LOGIN SCREEN (Obsidian Glass Aesthetic) -->
    <v-main v-if="!isAuthenticated" class="auth-wrapper d-flex align-center justify-center fill-height">
      <div class="auth-card pa-8 text-center">
        <!-- Logo Header -->
        <div class="d-flex align-center justify-center mb-4">
          <v-icon size="40" color="primary" class="mr-2">mdi-paw</v-icon>
          <span class="auth-brand">RedPandaium <span class="brand-accent">CAST</span></span>
        </div>

        <h2 class="text-h6 font-weight-bold mb-6 text-grey-lighten-1">{{ $t('auth.enterPin') }}</h2>

        <!-- PIN Display Dots -->
        <div class="d-flex justify-center mb-6">
          <div
            v-for="i in 4"
            :key="i"
            class="pin-dot mx-2"
            :class="{ 'pin-dot--filled': pinInput.length >= i }"
          ></div>
        </div>

        <!-- Error Message Space -->
        <div class="text-error text-caption font-weight-bold mb-4" style="height: 20px;">
          <span v-if="pinError" class="text-uppercase tracking-wider">{{ $t('auth.incorrectPin') }}</span>
        </div>

        <!-- Interactive Dialpad -->
        <div class="dialpad-grid">
          <v-row dense justify="center">
            <v-col cols="4" v-for="n in 9" :key="n">
              <button class="dialpad-btn" type="button" @click="appendPin(n.toString())">
                {{ n }}
              </button>
            </v-col>
            <v-col cols="4">
              <button class="dialpad-btn dialpad-btn--action" type="button" @click="clearPin" aria-label="Clear PIN">
                <v-icon size="22">mdi-backspace-outline</v-icon>
              </button>
            </v-col>
            <v-col cols="4">
              <button class="dialpad-btn" type="button" @click="appendPin('0')">
                0
              </button>
            </v-col>
            <v-col cols="4"></v-col>
          </v-row>
        </div>
      </div>
    </v-main>

    <!-- MAIN APP CONTENT -->
    <template v-else>
      <!-- Glassmorphism Streaming App Bar -->
      <header class="streaming-nav">
        <div class="streaming-nav__inner">
          <!-- Logo & Brand -->
          <div class="streaming-nav__brand">
            <v-icon size="30" color="primary" class="mr-2">mdi-paw</v-icon>
            <span class="nav-brand-title">
              RedPandaium <span class="brand-accent">CAST</span>
            </span>
          </div>

          <div class="streaming-nav__spacer"></div>

          <!-- Quick Search Button with Ctrl+K Badge -->
          <button
            class="nav-search-btn mr-3"
            @click="store.setSearchDialog(true)"
            type="button"
            :title="$t('nav.search')"
          >
            <v-icon size="18" class="mr-2 text-grey-lighten-1">mdi-magnify</v-icon>
            <span class="nav-search-text hidden-xs">{{ translations.lnkSearch || $t('nav.search') }}</span>
            <kbd class="nav-search-kbd ml-3 hidden-sm-and-down">{{ $t('nav.searchShortcut') }}</kbd>
          </button>

          <!-- Language Selector Pill -->
          <div class="nav-lang-wrap mr-3">
            <v-autocomplete
              v-model="siteLanguage"
              :items="languages"
              item-title="name"
              item-value="locale"
              :placeholder="$t('nav.selectLanguage')"
              prepend-inner-icon="mdi-translate"
              variant="plain"
              hide-details
              density="compact"
              class="nav-lang-autocomplete"
            ></v-autocomplete>
          </div>

          <!-- Help & Guide Button -->
          <v-btn
            icon="mdi-help-circle-outline"
            variant="text"
            class="hidden-xs text-grey-lighten-1"
            :title="$t('help.title')"
            @click="helpDialog = true"
          ></v-btn>
        </div>
      </header>

      <!-- Main Body Container -->
      <v-main class="streaming-main">
        <v-container class="pt-6 pb-16">
          <v-row justify="center">
            <v-col cols="12" md="12" lg="11" xl="10">
              <!-- Hero Spotlight Banner -->
              <HeroSpotlight
                @play="onHeroAction"
                @cast="onHeroCast"
              />

              <!-- Category Pills Filter Bar -->
              <CategoryPills v-model="selectedCategory" />

              <!-- Dynamic / Filtered Video Categories -->
              <template v-if="selectedCategory === 'all'">
                <VideoCategory categoryName="LatestVideos" :divider="true" />
                <VideoCategory categoryName="StudioMonthlyPrograms" :limit="6" :divider="true" />
                <VideoCategory categoryName="StudioTalks" :limit="6" :divider="true" />
                <VideoCategory categoryName="StudioNewsReports" :limit="6" :divider="true" />
                <VideoCategory categoryName="VODChildren" :limit="6" :divider="true" />
                <VideoCategory categoryName="VODFamily" :limit="6" :divider="true" />
                <VideoCategory categoryName="VODBible" :limit="6" />
              </template>

              <!-- Single Selected Category Grid -->
              <template v-else>
                <VideoCategory
                  :key="selectedCategory"
                  :categoryName="selectedCategory"
                  :limit="36"
                />
              </template>
            </v-col>
          </v-row>
        </v-container>
      </v-main>

      <!-- Video, Search & Help Modals -->
      <VideoDialog />
      <SearchDialog />
      <HelpDialog v-model="helpDialog" />
    </template>
  </v-app>
</template>

<style>
/* Global Font & Baseline Reset */
:root {
  --app-bg: #0B0E14;
  --app-surface: #121620;
  --app-card: #141923;
  --app-primary: #FF4757;
  --app-accent: #38BDF8;
}

body, html {
  background-color: var(--app-bg) !important;
  color: #F8FAFC !important;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
  overflow-y: auto !important;
  margin: 0;
  padding: 0;
}

.v-application {
  background: var(--app-bg) !important;
  font-family: 'Inter', sans-serif !important;
}

/* Custom Sleek Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #0B0E14;
}

::-webkit-scrollbar-thumb {
  background: #242D3D;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #333F54;
}

/* Brand Styling */
.brand-accent {
  color: #FF4757;
  font-weight: 900;
}

/* Glassmorphism App Bar */
.streaming-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  background: rgba(11, 14, 20, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.streaming-nav__inner {
  max-width: 1440px;
  margin: 0 auto;
  height: 68px;
  padding: 0 24px;
  display: flex;
  align-items: center;
}

.streaming-nav__brand {
  display: flex;
  align-items: center;
  user-select: none;
}

.nav-brand-title {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #FFFFFF;
}

.streaming-nav__spacer {
  flex: 1;
}

/* Quick Search Button */
.nav-search-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  color: #CBD5E1;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-search-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
}

.nav-search-kbd {
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #94A3B8;
  letter-spacing: 0.04em;
}

/* Language selector */
.nav-lang-wrap {
  width: 170px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 0 10px;
  height: 38px;
  display: flex;
  align-items: center;
  transition: border-color 0.2s ease;
}

.nav-lang-wrap:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.nav-lang-autocomplete .v-field {
  padding: 0 !important;
  font-size: 0.82rem;
}

/* Main Background */
.streaming-main {
  background: var(--app-bg);
  min-height: calc(100vh - 68px);
}

/* AUTH LOGIN CARD */
.auth-wrapper {
  background: radial-gradient(circle at center, #161D2B 0%, #0B0E14 70%);
}

.auth-card {
  width: 100%;
  max-width: 360px;
  background: rgba(18, 22, 32, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 28px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9);
}

.auth-brand {
  font-size: 1.25rem;
  font-weight: 800;
  color: #FFFFFF;
}

.pin-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.pin-dot--filled {
  background: #FF4757;
  border-color: #FF4757;
  box-shadow: 0 0 14px #FF4757;
  transform: scale(1.15);
}

.dialpad-grid {
  max-width: 250px;
  margin: 0 auto;
}

.dialpad-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #F8FAFC;
  font-size: 1.4rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
  user-select: none;
}

.dialpad-btn:hover {
  background: rgba(255, 71, 87, 0.2);
  border-color: rgba(255, 71, 87, 0.4);
  color: #FFFFFF;
  transform: scale(1.05);
}

.dialpad-btn:active {
  transform: scale(0.95);
  background: #FF4757;
}

.dialpad-btn--action {
  color: #FF6B81;
}

.dialpad-btn--action:hover {
  background: rgba(255, 71, 87, 0.25);
}
</style>