<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import { Video } from '@/types';
import { mediatorService } from '@/services/mediatorService';
import { openChromecastForVideo } from '@/services/subtitleService';
import VideoBentoCard from '@/components/VideoBentoCard.vue';

const props = defineProps({
  categoryName: { type: String, required: true },
  limit: { type: Number, default: 0 },
  divider: { type: Boolean, default: false },
});

const store = useAppStore();
const { t, te } = useI18n();

const videos = ref<Video[]>([]);
const loading = ref(true);
const subcategories = ref<{ key: string; name: string }[]>([]);
const selectedSubcategory = ref<string>('all');
const remoteTitle = ref<string>('');

const fetchVideos = async () => {
  loading.value = true;
  try {
    const langObj = store.getSiteLanguageObj || { code: 'E' };
    
    // Fetch details to get official localized category name and subcategories
    const details = await mediatorService.fetchCategoryDetails(
      props.categoryName,
      langObj.code,
      store.mediatorUrl
    );
    
    if (details?.name) {
      remoteTitle.value = details.name;
    } else {
      remoteTitle.value = '';
    }

    if (details?.type === 'container' && details?.subcategories?.length) {
      subcategories.value = details.subcategories;
    } else {
      subcategories.value = [];
    }

    // Determine target category to fetch media from
    const targetKey =
      selectedSubcategory.value !== 'all'
        ? selectedSubcategory.value
        : props.categoryName;

    videos.value = await mediatorService.fetchCategoryMedia(
      targetKey,
      langObj.code,
      props.limit,
      store.mediatorUrl
    );
  } catch (err) {
    console.error(`Failed to fetch category ${props.categoryName}:`, err);
  } finally {
    loading.value = false;
  }
};

const onSubcategoryChange = (subKey: string) => {
  selectedSubcategory.value = subKey;
  fetchVideos();
};

const openVideo = (video: Video) => {
  store.setSelectedVideo(video);
  store.setVideoDialog(true);
};

const castVideo = async (video: Video) => {
  const langObj = store.getSiteLanguageObj || { code: 'E' };
  const subLangObj = store.getSubtitleLanguageObj || { code: 'F' };
  await openChromecastForVideo(video, langObj.code, subLangObj.code, store.mediatorUrl);
};

const subtitlesVideo = (video: Video) => {
  store.setSelectedVideo(video);
  store.setVideoDialog(true);
};

onMounted(fetchVideos);

// Ensure reactivity for both categoryName and siteLanguage
watch(() => props.categoryName, () => {
  selectedSubcategory.value = 'all';
  fetchVideos();
});

watch(() => store.siteLanguage, () => {
  fetchVideos();
});

const displayTitle = computed(() => {
  if (remoteTitle.value) return remoteTitle.value;
  const i18nKey = `categories.${props.categoryName}`;
  if (te(i18nKey)) {
    return t(i18nKey);
  }
  const fallbackTitles: Record<string, string> = {
    LatestVideos: 'Latest Videos',
    StudioMonthlyPrograms: 'Monthly Programs',
    StudioTalks: 'Studio Talks',
    StudioNewsReports: 'News Reports',
    VODStudio: 'JW Broadcasting',
    VODChildren: 'Children',
    VODTeenagers: 'Teenagers',
    VODFamily: 'Family',
    VODProgramsEvents: 'Programs and Events',
    VODOurActivities: 'Our Activities',
    VODMinistry: 'Our Meetings and Ministry',
    VODOurOrganization: 'Our Organization',
    VODBible: 'The Bible',
    VODMovies: 'Dramas',
    VODSeries: 'Series',
    VODMusicVideos: 'Music',
    VODIntExp: 'Interviews and Experiences',
    VODAudioDescriptions: 'Audio Descriptions',
  };
  return fallbackTitles[props.categoryName] || props.categoryName;
});
</script>

<template>
  <section class="category-section mb-10" :id="`cat-${categoryName}`">
    <!-- Header -->
    <div class="category-section__header mb-4">
      <div class="d-flex align-center flex-wrap">
        <h2 class="category-title text-h5 font-weight-black">
          {{ displayTitle }}
        </h2>
        <span v-if="videos.length > 0 && !loading" class="category-count ml-3">
          {{ videos.length }}
        </span>
      </div>
      <slot name="title-actions"></slot>
    </div>

    <!-- Subcategory Pills (if this category has subcategories) -->
    <div v-if="subcategories.length > 0" class="subcategories-bar mb-5">
      <button
        type="button"
        class="subcat-chip"
        :class="{ 'subcat-chip--active': selectedSubcategory === 'all' }"
        @click="onSubcategoryChange('all')"
      >
        {{ $t('categories.all') || 'All' }}
      </button>

      <button
        v-for="sub in subcategories"
        :key="sub.key"
        type="button"
        class="subcat-chip"
        :class="{ 'subcat-chip--active': selectedSubcategory === sub.key }"
        @click="onSubcategoryChange(sub.key)"
      >
        {{ sub.name }}
      </button>
    </div>

    <!-- Skeleton Loading -->
    <v-row v-if="loading">
      <v-col v-for="i in (limit > 0 ? limit : 3)" :key="i" cols="12" sm="6" md="4" lg="4">
        <v-skeleton-loader type="card" class="rounded-xl" height="280"></v-skeleton-loader>
      </v-col>
    </v-row>

    <!-- Empty State -->
    <div v-else-if="videos.length === 0" class="empty-category-box pa-8 text-center rounded-xl">
      <v-icon size="48" color="grey-darken-1" class="mb-3">mdi-filmstrip-off</v-icon>
      <div class="text-subtitle-1 font-weight-bold text-grey-lighten-1">No videos found in this category</div>
    </div>

    <!-- Bento Video Grid -->
    <v-row v-else>
      <v-col
        v-for="video in videos"
        :key="video.lank"
        cols="12"
        sm="6"
        md="4"
        lg="4"
      >
        <VideoBentoCard
          :video="video"
          @select="openVideo"
          @cast="castVideo"
          @subtitles="subtitlesVideo"
        />
      </v-col>
    </v-row>

    <v-divider v-if="divider" class="category-divider mt-10"></v-divider>
  </section>
</template>

<style scoped>
.category-section {
  position: relative;
}

.category-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.category-title {
  color: #F8FAFC;
  letter-spacing: -0.02em;
  display: inline-flex;
  align-items: center;
}

.category-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #94A3B8;
}

/* Subcategories Bar */
.subcategories-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 8px;
  scrollbar-width: none;
}

.subcategories-bar::-webkit-scrollbar {
  display: none;
}

.subcat-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 14px;
  border-radius: 16px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.05);
  color: #94A3B8;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.subcat-chip:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #F8FAFC;
}

.subcat-chip--active {
  background: rgba(255, 71, 87, 0.2) !important;
  color: #FF6B81 !important;
  border-color: rgba(255, 71, 87, 0.5) !important;
  box-shadow: 0 2px 10px rgba(255, 71, 87, 0.25);
}

.empty-category-box {
  background: rgba(18, 22, 32, 0.6);
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.category-divider {
  border-color: rgba(255, 255, 255, 0.06) !important;
}
</style>