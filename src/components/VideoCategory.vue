<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import axios from 'axios';
import { useAppStore } from '@/store/app';
import { Video } from '@/types';

const props = defineProps({
  categoryName: { type: String, required: true },
  limit: { type: Number, default: 0 },
  divider: { type: Boolean, default: false }
});

const store = useAppStore();
const videos = ref<Video[]>([]);
const loading = ref(true);

const fetchVideos = async () => {
  loading.value = true;
  try {
    const langObj = store.getSiteLanguageObj || { code: 'E' };
    const url = `${store.mediatorUrl}/categories/${langObj.code}/${props.categoryName}?clientType=www`;
    const { data } = await axios.get(url);
    
    let fetchedVideos = data.category.media.map((m: any) => {
      const imgUrl = m.images?.lsr?.xl || m.images?.lsr?.lg || m.images?.wss?.lg || m.images?.pnr?.lg || m.images?.sqr?.lg || '';
      return {
        lank: m.languageAgnosticNaturalKey || m.naturalKey || m.lank || '',
        title: m.title,
        description: m.description,
        images: { lsr: { lg: imgUrl } },
        url: m.shareUrl
      };
    });

    if (props.limit > 0) fetchedVideos = fetchedVideos.slice(0, props.limit);
    videos.value = fetchedVideos;
  } catch (err) {
    console.error(`Failed to fetch category ${props.categoryName}:`, err);
  } finally {
    loading.value = false;
  }
};

const openVideo = (video: Video) => {
  store.setSelectedVideo(video);
  store.setVideoDialog(true);
};

onMounted(fetchVideos);
watch(() => store.siteLanguage, fetchVideos);

const categoryTitle = computed(() => {
  const titles: Record<string, string> = {
    LatestVideos: 'Latest Videos',
    StudioMonthlyPrograms: 'Monthly Programs',
    StudioTalks: 'Studio Talks',
    StudioNewsReports: 'News Reports'
  };
  return titles[props.categoryName] || props.categoryName;
});
</script>

<template>
  <div class="mb-8">
    <div class="d-flex align-center mb-4">
      <h2 class="text-h4 font-weight-bold">{{ categoryTitle }}</h2>
      <v-spacer></v-spacer>
      <slot name="title-actions"></slot>
    </div>

    <v-row v-if="loading">
      <!-- 3 items per row guaranteed on desktop -->
      <v-col v-for="i in (limit > 0 ? limit : 3)" :key="i" cols="12" md="4" lg="4">
        <v-skeleton-loader type="card" height="300"></v-skeleton-loader>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col v-for="video in videos" :key="video.lank" cols="12" md="4" lg="4">
        <v-card hover @click="openVideo(video)" rounded="xl" elevation="4">
          <v-img :src="video.images.lsr.lg" aspect-ratio="16/9" cover class="align-end bg-grey-lighten-2">
            <template v-slot:placeholder>
              <div class="d-flex align-center justify-center fill-height">
                <v-progress-circular indeterminate color="grey-lighten-1"></v-progress-circular>
              </div>
            </template>
            <div class="pa-4" style="background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.9)); color: white;">
              <div class="text-h6 font-weight-bold text-truncate">{{ video.title }}</div>
            </div>
          </v-img>
        </v-card>
      </v-col>
    </v-row>
    <v-divider v-if="divider" class="mt-8"></v-divider>
  </div>
</template>