<script setup lang="ts" name="App">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import axios from 'axios';

import { useAppStore } from '@/store/app';

import VideoCategory from '@/components/VideoCategory.vue';
import VideoDialog from '@/components/VideoDialog.vue';
import SearchDialog from '@/components/SearchDialog.vue';

// --- AUTHENTICATION LOGIC ---
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
  if (pinInput.value === '1234') {
    isAuthenticated.value = true;
    localStorage.setItem('jwcast_auth', 'true');
  } else {
    pinError.value = true;
    pinInput.value = '';
  }
};

watch(pinInput, (val) => {
  if (val.length === 4) {
    setTimeout(checkPin, 150); // slight delay to show the 4th dot filling up
  }
});

// --- EXISTING APP LOGIC ---
const store = useAppStore();
const route = useRoute();
const router = useRouter();
const theme = useTheme();

const setDarkTheme = () => {
  theme.global.name.value = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const fetchLanguages = async () => {
  try {
    const url = `${store.mediatorUrl}/languages/en/all?clientType=www`;
    const { data } = await axios.get(url);
    const langs = data.languages;
    
    const pinned = ['nl', 'en', 'fr'];
    const sorted = [...langs].sort((a, b) => {
      if (pinned.includes(a.locale) && !pinned.includes(b.locale)) return -1;
      if (!pinned.includes(a.locale) && pinned.includes(b.locale)) return 1;
      return 0;
    });
    store.setLanguages(sorted);
  } catch (error) {
    console.error('Failed to fetch languages:', error);
  }
};

const fetchTranslations = async () => {
  try {
    const langObj = store.getSiteLanguageObj || { code: 'E' };
    const url = `${store.mediatorUrl}/translations/${langObj.code}`;
    const { data } = await axios.get(url);
    store.setTranslations(data.translations[langObj.code]);
  } catch (error) {
    console.error('Failed to fetch translations:', error);
  }
};

watch(() => route.params.language, async (newLang) => {
  if (newLang && typeof newLang === 'string') {
    if (!store.languages.some(l => l.locale === newLang)) {
      store.setSiteLanguage('en');
      router.push({ name: 'Home', params: { language: 'en' } });
    } else {
      store.setSiteLanguage(newLang);
    }
  }
});

watch(() => store.siteLanguage, async () => {
  await fetchTranslations();
  if (route.params.language !== store.siteLanguage) {
    router.push({ name: 'Home', params: { language: store.siteLanguage } });
  }
});

onMounted(async () => {
  setDarkTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setDarkTheme);
  
  await fetchLanguages();
  if (route.params.language) {
    store.setSiteLanguage(route.params.language as string);
  }
  await fetchTranslations();
});

const translations = computed(() => store.translations);
const languages = computed(() => store.languages);
const siteLanguage = computed({
  get: () => store.siteLanguage,
  set: (val) => store.setSiteLanguage(val)
});

const guideButtonText = computed(() => {
  if (store.siteLanguage === 'nl') return 'Handleiding';
  if (store.siteLanguage === 'fr') return 'Manuel';
  return store.translations.lnkHelpView || 'Guide';
});
</script>

<template>
  <v-app>
    <!-- LOGIN SCREEN -->
    <v-main v-if="!isAuthenticated" class="bg-surface d-flex align-center justify-center fill-height">
      <v-card elevation="8" rounded="xl" max-width="350" class="w-100 pa-6 text-center">
        <v-icon size="64" color="primary" class="mb-4">mdi-lock-outline</v-icon>
        <h2 class="text-h5 font-weight-bold mb-6">Enter PIN</h2>

        <!-- PIN Display Dots -->
        <div class="d-flex justify-center mb-6">
          <v-avatar 
            v-for="i in 4" 
            :key="i" 
            size="24" 
            :color="pinInput.length >= i ? 'primary' : 'grey-lighten-3'" 
            class="mx-2 transition-swing"
          ></v-avatar>
        </div>

        <!-- Error Message Space (preserves height to avoid layout shift) -->
        <div class="text-error text-caption font-weight-bold mb-4" style="height: 20px;">
          <span v-if="pinError" class="text-uppercase tracking-wide">Incorrect PIN</span>
        </div>

        <!-- Interactive Dialpad -->
        <div style="max-width: 250px; margin: 0 auto;">
          <v-row dense justify="center" class="mb-2">
            <v-col cols="4" v-for="n in 9" :key="n">
              <v-btn icon size="x-large" variant="text" @click="appendPin(n.toString())" class="text-h5 font-weight-regular">{{ n }}</v-btn>
            </v-col>
            <v-col cols="4">
              <v-btn icon size="x-large" variant="text" @click="clearPin" color="error">
                <v-icon>mdi-backspace-outline</v-icon>
              </v-btn>
            </v-col>
            <v-col cols="4">
              <v-btn icon size="x-large" variant="text" @click="appendPin('0')" class="text-h5 font-weight-regular">0</v-btn>
            </v-col>
            <v-col cols="4"></v-col>
          </v-row>
        </div>
      </v-card>
    </v-main>

    <!-- MAIN APP CONTENT -->
    <template v-else>
      <v-app-bar color="primary" elevation="2">
        <v-toolbar-title class="font-weight-bold">RedPandaium Cast</v-toolbar-title>
        <v-spacer></v-spacer>
        
        <v-btn 
          prepend-icon="mdi-magnify" 
          variant="text"
          @click="store.setSearchDialog(true)"
        >
          <span class="hidden-xs">{{ translations.lnkSearch || 'Search' }}</span>
        </v-btn>
        
        <v-btn 
          prepend-icon="mdi-book-open-blank-variant" 
          variant="text" 
          href="https://github.com/Mercu7io/jw-cast" 
          target="_blank"
          class="hidden-xs"
        >
          {{ guideButtonText }}
        </v-btn>
      </v-app-bar>

      <v-main class="bg-surface">
        <v-container>
          <!-- Widened layout to force tiles to be significantly larger while keeping 3 per line -->
          <v-row justify="center">
            <v-col cols="12" md="12" lg="10" xl="10">
              
              <div class="d-flex flex-column flex-sm-row justify-space-between align-center mt-6 mb-8">
                <h1 class="text-h3 font-weight-black primary--text mb-4 mb-sm-0">
                  {{ translations.hdgVideos || '\u200D' }}
                </h1>
                
                <!-- Cleaned up, label-less, compact language selector -->
                <div style="width: 100%; max-width: 250px;">
                  <v-autocomplete
                    v-model="siteLanguage"
                    :items="languages"
                    item-title="name"
                    item-value="locale"
                    placeholder="Select Language"
                    prepend-inner-icon="mdi-translate"
                    variant="outlined"
                    rounded="pill"
                    bg-color="background"
                    hide-details
                    density="compact"
                  ></v-autocomplete>
                </div>
              </div>

              <VideoCategory categoryName="LatestVideos" :divider="true" />
              <VideoCategory categoryName="StudioMonthlyPrograms" :limit="12" :divider="true" />
              <VideoCategory categoryName="StudioTalks" :limit="9" :divider="true" />
              <VideoCategory categoryName="StudioNewsReports" :limit="9" />
            </v-col>
          </v-row>
        </v-container>
      </v-main>

      <VideoDialog />
      <SearchDialog />
    </template>
  </v-app>
</template>

<style>
.v-application {
  font-family: 'Inter', sans-serif !important;
}
html { overflow-y: auto !important; }
</style>