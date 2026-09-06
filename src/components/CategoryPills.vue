<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import { mediatorService } from '@/services/mediatorService';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
  }>(),
  {
    modelValue: 'all',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'select', value: string): void;
}>();

const store = useAppStore();
const { t } = useI18n();

interface PillCategory {
  key: string;
  name: string;
  icon: string;
}

const categories = ref<PillCategory[]>([]);
const loading = ref(true);

const scrollContainer = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

const iconMap: Record<string, string> = {
  all: 'mdi-view-grid-outline',
  LatestVideos: 'mdi-clock-fast',
  VODStudio: 'mdi-television-play',
  VODChildren: 'mdi-baby-face-outline',
  VODTeenagers: 'mdi-school-outline',
  VODFamily: 'mdi-home-heart',
  VODProgramsEvents: 'mdi-calendar-star',
  VODOurActivities: 'mdi-earth',
  VODMinistry: 'mdi-book-open-page-variant-outline',
  VODOurOrganization: 'mdi-office-building-outline',
  VODBible: 'mdi-book-cross',
  VODMovies: 'mdi-movie-open-play-outline',
  VODSeries: 'mdi-filmstrip',
  VODMusicVideos: 'mdi-music-note',
  VODIntExp: 'mdi-microphone-variant',
  VODAudioDescriptions: 'mdi-headphones',
};

const checkScroll = () => {
  if (!scrollContainer.value) return;
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value;
  canScrollLeft.value = scrollLeft > 4;
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 4;
};

const scrollLeftAction = () => {
  if (!scrollContainer.value) return;
  scrollContainer.value.scrollBy({ left: -260, behavior: 'smooth' });
};

const scrollRightAction = () => {
  if (!scrollContainer.value) return;
  scrollContainer.value.scrollBy({ left: 260, behavior: 'smooth' });
};

const onWheel = (e: WheelEvent) => {
  if (!scrollContainer.value) return;
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    scrollContainer.value.scrollLeft += e.deltaY;
    checkScroll();
  }
};

const fetchCategories = async () => {
  loading.value = true;
  try {
    const langObj = store.getSiteLanguageObj || { code: 'E' };
    const remoteCategories = await mediatorService.fetchVideoCategories(
      langObj.code,
      store.mediatorUrl
    );

    const list: PillCategory[] = [
      {
        key: 'all',
        name: t('categories.all') || 'All',
        icon: iconMap.all,
      },
      {
        key: 'LatestVideos',
        name: t('categories.LatestVideos') || 'Latest Videos',
        icon: iconMap.LatestVideos,
      },
    ];

    for (const cat of remoteCategories) {
      list.push({
        key: cat.key,
        name: cat.name,
        icon: iconMap[cat.key] || 'mdi-play-circle-outline',
      });
    }

    categories.value = list;
    await nextTick();
    checkScroll();
  } catch (err) {
    console.error('Failed to load video categories:', err);
  } finally {
    loading.value = false;
  }
};

const selectCategory = (key: string) => {
  emit('update:modelValue', key);
  emit('select', key);
};

onMounted(async () => {
  await fetchCategories();
  window.addEventListener('resize', checkScroll);
});

watch(
  () => store.siteLanguage,
  async () => {
    await fetchCategories();
  }
);
</script>

<template>
  <div class="category-pills-container">
    <!-- Left Scroll Button -->
    <button
      v-show="canScrollLeft"
      class="scroll-btn scroll-btn--left"
      @click="scrollLeftAction"
      type="button"
      aria-label="Scroll categories left"
    >
      <v-icon size="20">mdi-chevron-left</v-icon>
    </button>

    <!-- Scrollable Pills Track -->
    <div
      ref="scrollContainer"
      class="category-pills-track"
      @scroll="checkScroll"
      @wheel="onWheel"
    >
      <button
        v-for="cat in categories"
        :key="cat.key"
        type="button"
        class="category-pill"
        :class="{ 'category-pill--active': modelValue === cat.key }"
        @click="selectCategory(cat.key)"
      >
        <v-icon size="16" class="mr-1 pill-icon">{{ cat.icon }}</v-icon>
        <span class="pill-name">{{ cat.name }}</span>
      </button>
    </div>

    <!-- Right Scroll Button -->
    <button
      v-show="canScrollRight"
      class="scroll-btn scroll-btn--right"
      @click="scrollRightAction"
      type="button"
      aria-label="Scroll categories right"
    >
      <v-icon size="20">mdi-chevron-right</v-icon>
    </button>
  </div>
</template>

<style scoped>
.category-pills-container {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 28px;
  width: 100%;
}

.category-pills-track {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  scroll-behavior: smooth;
  padding: 6px 12px 10px;
  width: 100%;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.category-pills-track::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.category-pill {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  padding: 8px 18px;
  border-radius: 24px;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  background: #141923;
  color: #94A3B8;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  flex-shrink: 0;
}

.category-pill:hover {
  background: #1C2331;
  color: #FFFFFF;
  border-color: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.category-pill--active {
  background: #FF4757 !important;
  color: #FFFFFF !important;
  border-color: transparent !important;
  box-shadow: 0 4px 14px rgba(255, 71, 87, 0.45);
}

.pill-icon {
  opacity: 0.85;
}

.pill-name {
  letter-spacing: 0.01em;
}

/* SLEEK FROSTED GLASS SCROLL ARROWS */
.scroll-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(18, 22, 32, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #F8FAFC;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  transition: all 0.2s ease;
}

.scroll-btn:hover {
  background: #FF4757;
  border-color: #FF4757;
  color: #FFFFFF;
  transform: translateY(-50%) scale(1.1);
  box-shadow: 0 6px 20px rgba(255, 71, 87, 0.5);
}

.scroll-btn--left {
  left: -12px;
}

.scroll-btn--right {
  right: -12px;
}
</style>
