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
import ContinueWatchingRow from '@/components/ContinueWatchingRow.vue';

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

const checkPin = async () => {
  const entered = pinInput.value;
  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: entered })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        isAuthenticated.value = true;
        localStorage.setItem('jwcast_auth', 'true');
        return;
      }
    } else if (res.status === 401 || res.status === 400) {
      pinError.value = true;
      pinInput.value = '';
      return;
    }
  } catch (_) {
    // Fallback if backend is unreachable (e.g., standalone frontend development)
    if (entered === validPin) {
      isAuthenticated.value = true;
      localStorage.setItem('jwcast_auth', 'true');
      return;
    }
  }

  if (entered === validPin) {
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
  store.initTheme();
  theme.global.name.value = store.effectiveTheme;
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

watch(() => store.effectiveTheme, (newTheme) => {
  theme.global.name.value = newTheme;
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
  <v-app :theme="store.effectiveTheme">
    <!-- LOGIN SCREEN (Adaptive Glass Aesthetic) -->
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

          <!-- Theme Switcher Menu -->
          <v-menu location="bottom end">
            <template v-slot:activator="{ props }">
              <v-btn
                v-bind="props"
                variant="text"
                class="mr-2 nav-theme-btn"
                icon
                :title="$t('nav.theme')"
                :aria-label="$t('nav.theme')"
              >
                <v-icon size="20">
                  {{ store.themeMode === 'system' ? 'mdi-laptop' : store.effectiveTheme === 'dark' ? 'mdi-weather-night' : 'mdi-white-balance-sunny' }}
                </v-icon>
              </v-btn>
            </template>
            <v-list density="compact" rounded="lg" class="theme-menu-list">
              <v-list-item
                prepend-icon="mdi-weather-night"
                :active="store.themeMode === 'dark'"
                @click="store.setThemeMode('dark')"
              >
                <v-list-item-title>{{ $t('nav.themeDark') }}</v-list-item-title>
              </v-list-item>
              <v-list-item
                prepend-icon="mdi-white-balance-sunny"
                :active="store.themeMode === 'light'"
                @click="store.setThemeMode('light')"
              >
                <v-list-item-title>{{ $t('nav.themeLight') }}</v-list-item-title>
              </v-list-item>
              <v-list-item
                prepend-icon="mdi-laptop"
                :active="store.themeMode === 'system'"
                @click="store.setThemeMode('system')"
              >
                <v-list-item-title>{{ $t('nav.themeSystem') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>

          <!-- Help & Guide Button -->
          <v-btn
            icon="mdi-help-circle-outline"
            variant="text"
            class="hidden-xs nav-help-btn"
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

              <!-- Continue Watching Carousel (when playback history exists) -->
              <ContinueWatchingRow @play="onHeroAction" />

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
/* Global Font & Baseline Reset with Adaptive Design Tokens */
:root,
[data-theme="dark"] {
  --app-bg: #0B0E14;
  --app-surface: #121620;
  --app-card: #141923;
  --app-card-border: rgba(255, 255, 255, 0.08);
  --app-text-primary: #F8FAFC;
  --app-text-secondary: #94A3B8;
  --app-nav-bg: rgba(11, 14, 20, 0.85);
  --app-nav-border: rgba(255, 255, 255, 0.07);
  --app-input-bg: rgba(255, 255, 255, 0.05);
  --app-input-border: rgba(255, 255, 255, 0.1);
  --app-scrollbar: #242D3D;
  --app-primary: #FF4757;
  --app-accent: #38BDF8;
  --app-auth-bg: radial-gradient(circle at center, #161D2B 0%, #0B0E14 70%);
  --app-auth-card: rgba(18, 22, 32, 0.85);
  --app-dialpad-btn: rgba(255, 255, 255, 0.05);
  --app-dialpad-border: rgba(255, 255, 255, 0.08);
}

[data-theme="light"] {
  --app-bg: #F1F5F9;
  --app-surface: #FFFFFF;
  --app-card: #FFFFFF;
  --app-card-border: rgba(15, 23, 42, 0.08);
  --app-text-primary: #0F172A;
  --app-text-secondary: #64748B;
  --app-nav-bg: rgba(241, 245, 249, 0.88);
  --app-nav-border: rgba(15, 23, 42, 0.08);
  --app-input-bg: rgba(15, 23, 42, 0.04);
  --app-input-border: rgba(15, 23, 42, 0.12);
  --app-scrollbar: #CBD5E1;
  --app-primary: #FF4757;
  --app-accent: #0284C7;
  --app-auth-bg: radial-gradient(circle at center, #E2E8F0 0%, #F1F5F9 70%);
  --app-auth-card: rgba(255, 255, 255, 0.95);
  --app-dialpad-btn: rgba(15, 23, 42, 0.04);
  --app-dialpad-border: rgba(15, 23, 42, 0.08);
}

body, html {
  background-color: var(--app-bg) !important;
  color: var(--app-text-primary) !important;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
  overflow-y: auto !important;
  margin: 0;
  padding: 0;
  transition: background-color 0.25s ease, color 0.25s ease;
}

.v-application {
  background: var(--app-bg) !important;
  color: var(--app-text-primary) !important;
  font-family: 'Inter', sans-serif !important;
  transition: background 0.25s ease;
}

/* Custom Sleek Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--app-bg);
}

::-webkit-scrollbar-thumb {
  background: var(--app-scrollbar);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--app-primary);
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
  background: var(--app-nav-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--app-nav-border);
  transition: background 0.25s ease, border-color 0.25s ease;
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
  color: var(--app-text-primary);
}

.streaming-nav__spacer {
  flex: 1;
}

/* Quick Search Button */
.nav-search-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  background: var(--app-input-bg);
  border: 1px solid var(--app-input-border);
  border-radius: 20px;
  color: var(--app-text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-search-btn:hover {
  border-color: rgba(255, 71, 87, 0.4);
  color: var(--app-text-primary);
}

.nav-search-kbd {
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  background: var(--app-input-bg);
  border-radius: 6px;
  color: var(--app-text-secondary);
  letter-spacing: 0.04em;
}

/* Language selector */
.nav-lang-wrap {
  width: 170px;
  background: var(--app-input-bg);
  border: 1px solid var(--app-input-border);
  border-radius: 20px;
  padding: 0 10px;
  height: 38px;
  display: flex;
  align-items: center;
  transition: border-color 0.2s ease;
}

.nav-lang-wrap:hover {
  border-color: rgba(255, 71, 87, 0.4);
}

.nav-lang-autocomplete .v-field {
  padding: 0 !important;
  font-size: 0.82rem;
}

.nav-theme-btn,
.nav-help-btn {
  color: var(--app-text-secondary) !important;
}

.nav-theme-btn:hover,
.nav-help-btn:hover {
  color: var(--app-text-primary) !important;
}

/* Main Background */
.streaming-main {
  background: var(--app-bg);
  min-height: calc(100vh - 68px);
  transition: background 0.25s ease;
}

/* AUTH LOGIN CARD */
.auth-wrapper {
  background: var(--app-auth-bg);
}

.auth-card {
  width: 100%;
  max-width: 360px;
  background: var(--app-auth-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--app-card-border);
  border-radius: 28px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
}

.auth-brand {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--app-text-primary);
}

.pin-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--app-input-bg);
  border: 1px solid var(--app-input-border);
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
  background: var(--app-dialpad-btn);
  border: 1px solid var(--app-dialpad-border);
  color: var(--app-text-primary);
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
  color: #FF4757;
  transform: scale(1.05);
}

.dialpad-btn:active {
  transform: scale(0.95);
  background: #FF4757;
  color: #FFFFFF;
}

.dialpad-btn--action {
  color: #FF6B81;
}

.dialpad-btn--action:hover {
  background: rgba(255, 71, 87, 0.25);
}
</style>