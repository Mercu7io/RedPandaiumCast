<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import { SearchResponse } from '@/types';
import { searchService } from '@/services/searchService';
import { mediatorService, formatMediaNodeToVideo } from '@/services/mediatorService';

const store = useAppStore();
const { t } = useI18n();

const dialog = computed({
  get: () => store.searchDialog,
  set: (val) => store.setSearchDialog(val)
});

const jwt = ref('');
const query = ref('');
const sort = ref('rel');
const isLoading = ref(false);
const response = ref<SearchResponse | null>(null);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const placeholder = computed(() => {
  return t('search.placeholder');
});

const fetchToken = async () => {
  try {
    jwt.value = await searchService.fetchToken();
  } catch (error) {
    console.error('Failed to fetch JW token:', error);
  }
};

onMounted(fetchToken);

const fetchVideo = async (langCode: string | undefined, lank: string | undefined) => {
  if (langCode === undefined || lank === undefined) {
    return;
  }
  try {
    const rawMedia = await mediatorService.fetchMediaItem(lank, langCode, store.mediatorUrl);
    if (rawMedia) {
      const formattedVideo = formatMediaNodeToVideo(rawMedia);
      store.setSelectedVideo(formattedVideo);
      store.setVideoDialog(true);
      dialog.value = false;
    }
  } catch (error) {
    console.error('Failed to fetch selected video:', error);
  }
};

const executeSearch = async (searchQuery: string) => {
  if (searchQuery === null || searchQuery.trim() === '') {
    response.value = null;
    return;
  }

  // Check if query is a direct jw.org link
  const parsedDirect = searchService.parseDirectJwUrl(searchQuery);
  if (parsedDirect) {
    let lang = parsedDirect.langCode;
    if (!lang && parsedDirect.locale) {
      lang = store.findLanguageByLocale(parsedDirect.locale)?.code;
    }
    if (parsedDirect.lank) {
      await fetchVideo(lang, parsedDirect.lank);
      query.value = '';
      return;
    }
  }

  isLoading.value = true;
  const langCode = store.getSiteLanguageObj?.code || 'E';

  try {
    const searchData = await searchService.searchVideos(searchQuery, langCode, sort.value, jwt.value);
    response.value = searchData;
  } catch (error: any) {
    if (!axios.isAxiosError(error)) {
      return;
    }
    // 401 token refresh retry
    if (error.response?.status === 401) {
      await fetchToken();
      try {
        response.value = await searchService.searchVideos(searchQuery, langCode, sort.value, jwt.value);
      } catch (retryError) {
        console.error('Search retry failed after token refresh:', retryError);
      }
    } else {
      console.error('Search query failed:', error);
    }
  } finally {
    isLoading.value = false;
  }
};

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => executeSearch(val), 400);
});

watch(sort, () => executeSearch(query.value));

watch(() => store.siteLanguage, () => { 
  query.value = ''; 
  response.value = null; 
});
</script>

<template>
  <v-dialog v-model="dialog" max-width="900" scrollable transition="dialog-bottom-transition">
    <v-card rounded="xl">
      <v-toolbar color="primary" class="flex-grow-0">
        <v-text-field
          v-model="query"
          prepend-inner-icon="mdi-magnify"
          :placeholder="placeholder"
          hide-details
          variant="outlined"
          density="compact"
          bg-color="white"
          clearable
          autofocus
          class="mx-4 my-2"
        ></v-text-field>
        <v-btn icon="mdi-close" variant="text" @click="dialog = false" aria-label="Close"></v-btn>
      </v-toolbar>
      
      <v-card-text class="pa-4 bg-grey-lighten-4">
        <v-container v-if="response">
          <v-row class="mb-4" align="center">
            <v-col cols="12" sm="8">
              <span class="text-subtitle-1">{{ response.pagination?.label || response.messages?.[0]?.message }}</span>
            </v-col>
            <v-col cols="12" sm="4" v-if="response.sorts && response.sorts.length > 0">
              <v-select
                v-model="sort"
                :items="response.sorts.map(s => ({ key: s.link.includes('newest') ? 'newest' : s.link.includes('oldest') ? 'oldest' : 'rel', label: s.label }))"
                item-title="label"
                item-value="key"
                prepend-inner-icon="mdi-sort"
                variant="outlined"
                density="compact"
                hide-details
              ></v-select>
            </v-col>
          </v-row>
          
          <v-row>
            <v-col v-for="result in response.results" :key="result.lank" cols="12" sm="6" lg="4">
              <v-card hover @click="fetchVideo(store.getSiteLanguageObj?.code || 'E', result.lank)" rounded="lg">
                <v-img
                  :src="result.image?.url"
                  aspect-ratio="16/9"
                  cover
                  class="align-end bg-grey-lighten-2"
                >
                  <template v-slot:placeholder>
                    <div class="d-flex align-center justify-center fill-height">
                      <v-progress-circular indeterminate color="grey-lighten-1"></v-progress-circular>
                    </div>
                  </template>
                  <div class="pa-2" style="background: rgba(0,0,0,0.6); color: white;">
                    <div class="text-body-2 font-weight-bold text-truncate" style="line-height: 1.2;">{{ result.title }}</div>
                  </div>
                </v-img>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
        
        <v-container v-else-if="isLoading">
          <v-row>
            <v-col v-for="i in 6" :key="i" cols="12" sm="6" lg="4">
              <v-skeleton-loader type="image" height="150"></v-skeleton-loader>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>