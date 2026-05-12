<script setup lang="ts" name="App">
import { onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import axios from 'axios';

import { useAppStore } from '@/store/app';
import { whatsappChannels } from '@/config/whatsappChannels';

import VideoCategory from '@/components/VideoCategory.vue';
import VideoDialog from '@/components/VideoDialog.vue';
import SearchDialog from '@/components/SearchDialog.vue';
import GetNotifiedDialog from '@/components/GetNotifiedDialog.vue';

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
const whatsappChannel = computed(() => whatsappChannels[store.siteLanguage]);

const guideButtonText = computed(() => {
  if (store.siteLanguage === 'nl') return 'Handleiding';
  if (store.siteLanguage === 'fr') return 'Manuel';
  return store.translations.lnkHelpView || 'Guide';
});
</script>

<template>
  <v-app>
    <v-app-bar color="primary" elevation="2">
      <v-toolbar-title class="font-weight-bold">RedPandaium Cast</v-toolbar-title>
      <v-spacer></v-spacer>
      
      <v-btn 
        v-if="translations.lnkSearch" 
        prepend-icon="mdi-magnify" 
        variant="text"
        @click="store.setSearchDialog(true)"
      >
        <span class="hidden-xs">{{ translations.lnkSearch }}</span>
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



            <VideoCategory categoryName="StudioMonthlyPrograms" :limit="12" :divider="true" />
            <VideoCategory categoryName="StudioTalks" :limit="9" :divider="true" />
            <VideoCategory categoryName="StudioNewsReports" :limit="9" />
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <VideoDialog />
    <SearchDialog />
    <GetNotifiedDialog />
  </v-app>
</template>

<style>
.v-application {
  font-family: 'Inter', sans-serif !important;
}
html { overflow-y: auto !important; }
</style>