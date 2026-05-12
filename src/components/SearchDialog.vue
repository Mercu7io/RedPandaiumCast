<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import { useAppStore } from '@/store/app';
import { Result, SearchResponse } from '@/types';

const store = useAppStore();
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
  if (store.siteLanguage === 'nl') return 'Zoek of plak jw.org link...';
  if (store.siteLanguage === 'fr') return 'Rechercher ou coller un lien jw.org...';
  return 'Search or paste jw.org link...';
});

// Matches Original Vue 2: fetchToken()
const fetchToken = async () => {
  try {
    // Use exact JWT token endpoint from the Vue 2 dump instead of store.tokenUrl
    const res = await axios.get('https://b.jw-cdn.org/tokens/jworg.jwt');
    jwt.value = res.data;
  } catch (error) {
    console.error('Failed to fetch JW token:', error);
  }
};

onMounted(fetchToken);

// Matches Original Vue 2: fetchVideo()
const fetchVideo = async (langCode: string | undefined, lank: string | undefined) => {
  if (langCode === undefined || lank === undefined) {
    return;
  }
  try {
    const res = await axios.get(`${store.mediatorUrl}/media-items/${langCode}/${lank}?clientType=www`);
    if (res.data.media && res.data.media.length > 0) {
      const m = res.data.media[0];
      
      // BUGFIX: We must manually format the raw API media node to match our app's Video interface
      // exactly like we do in VideoCategory.vue, otherwise VideoDialog crashes due to missing image mappings.
      const imgUrl = m.images?.lsr?.xl || m.images?.lsr?.lg || m.images?.wss?.lg || m.images?.pnr?.lg || m.images?.sqr?.lg || '';
      const formattedVideo = {
        lank: m.languageAgnosticNaturalKey || m.naturalKey || m.lank || '',
        title: m.title,
        description: m.description,
        images: { lsr: { lg: imgUrl } },
        url: m.shareUrl
      };

      store.setSelectedVideo(formattedVideo);
      store.setVideoDialog(true);
      dialog.value = false;
    }
  } catch (error) {
    console.error('Failed to fetch selected video:', error);
  }
};

// Matches Original Vue 2: fetchResponse() / onSearchQueryChange()
const executeSearch = async (searchQuery: string) => {
  if (searchQuery === null || searchQuery === '') {
    response.value = null;
    return;
  }
  
  const finderRegex = /jw\.org\/finder\?.+&.+/;
  const wtLocaleRegex = /wtlocale=(?<code>[A-Za-z]+)/;
  const localeRegex = /locale=(?<locale>[A-Za-z]+)/;
  const lankRegex = /lank=(?<lank>[\w-]+)/;
  const mediaItemsRegex = /jw\.org\/[\w-]+\/.+#(?<locale>[\w-]+)\/mediaitems\/(?<category>[\w-]+)\/(?<lank>[\w-]+)/;

  if (finderRegex.test(searchQuery)) {
    const lang = wtLocaleRegex.exec(searchQuery)?.groups?.code 
      ?? store.findLanguageByLocale(localeRegex.exec(searchQuery)?.groups?.locale)?.code;
    const lank = lankRegex.exec(searchQuery)?.groups?.lank;
    await fetchVideo(lang, lank);
    query.value = '';
    return;
  }

  if (mediaItemsRegex.test(searchQuery)) {
    const match = mediaItemsRegex.exec(searchQuery);
    const lang = store.findLanguageByLocale(match?.groups?.locale)?.code;
    const lank = match?.groups?.lank;
    await fetchVideo(lang, lank);
    query.value = '';
    return;
  }

  isLoading.value = true;
  
  const langCode = store.getSiteLanguageObj?.code || 'E';
  
  // Use the exact search endpoint from the Vue 2 dump instead of store.searchUrl
  // Using `/search/api/v1` causes the strict 403 CORS rejection.
  const searchApiBaseUrl = 'https://b.jw-cdn.org/apis/search/results';
  const url = `${searchApiBaseUrl}/${langCode}/videos?sort=${sort.value}&q=${searchQuery}`;
  
  const config = {
    headers: {
      Authorization: `Bearer ${jwt.value}`
    }
  };

  try {
    const res = await axios.get<SearchResponse>(url, config);
    res.data.results = res.data.results.filter(r => r.subtype !== 'videoCategory');
    response.value = res.data;
  } catch (error: any) {
    if (!axios.isAxiosError(error)) {
      return;
    }
    // 1:1 Match with original 401 handling
    if (error.response?.status === 401) {
      fetchToken();
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
        <v-btn icon="mdi-close" variant="text" @click="dialog = false"></v-btn>
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