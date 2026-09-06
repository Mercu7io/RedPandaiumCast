<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Video } from '@/types';
import { useAppStore } from '@/store/app';
import { mediatorService } from '@/services/mediatorService';
import { fetchChromecastUrl, openChromecastForVideo } from '@/services/subtitleService';

const emit = defineEmits<{
  (e: 'play', video: Video): void;
  (e: 'cast', video: Video): void;
}>();

const store = useAppStore();
const { t } = useI18n();

const videos = ref<Video[]>([]);
const currentIndex = ref(0);
const loading = ref(true);
const progress = ref(0);
const isPaused = ref(false);
const isHovered = ref(false);

const SLIDE_DURATION_MS = 7000;
const TICK_MS = 50;
let timer: ReturnType<typeof setInterval> | null = null;

const currentVideo = computed<Video | null>(() => {
  if (!videos.value.length) return null;
  return videos.value[currentIndex.value] || null;
});

const fetchFeatured = async () => {
  loading.value = true;
  try {
    const langObj = store.getSiteLanguageObj || { code: 'E' };
    // Fetch the 3 latest releases for the carousel
    const items = await mediatorService.fetchCategoryMedia(
      'LatestVideos',
      langObj.code,
      3,
      store.mediatorUrl
    );
    videos.value = items;
    currentIndex.value = 0;
    progress.value = 0;
  } catch (err) {
    console.error('Failed to load featured carousel videos:', err);
  } finally {
    loading.value = false;
  }
};

const startTimer = () => {
  stopTimer();
  timer = setInterval(() => {
    if (isPaused.value || isHovered.value || videos.value.length <= 1) return;
    progress.value += (TICK_MS / SLIDE_DURATION_MS) * 100;
    if (progress.value >= 100) {
      nextSlide();
    }
  }, TICK_MS);
};

const stopTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const nextSlide = () => {
  if (!videos.value.length) return;
  currentIndex.value = (currentIndex.value + 1) % videos.value.length;
  progress.value = 0;
};

const prevSlide = () => {
  if (!videos.value.length) return;
  currentIndex.value = (currentIndex.value - 1 + videos.value.length) % videos.value.length;
  progress.value = 0;
};

const goToSlide = (index: number) => {
  currentIndex.value = index;
  progress.value = 0;
};

const togglePause = (e: MouseEvent) => {
  e.stopPropagation();
  isPaused.value = !isPaused.value;
};

onMounted(async () => {
  await fetchFeatured();
  startTimer();
});

onBeforeUnmount(() => {
  stopTimer();
});

watch(() => store.siteLanguage, async () => {
  await fetchFeatured();
});

const currentCastUrl = ref<string>('');

const updateCastUrl = async (vid: Video | null) => {
  if (!vid) {
    currentCastUrl.value = '';
    return;
  }
  const langObj = store.getSiteLanguageObj || { code: 'E' };
  const subLangObj = store.getSubtitleLanguageObj || { code: 'F' };
  const url = await fetchChromecastUrl(vid, langObj.code, subLangObj.code, store.mediatorUrl);
  if (currentVideo.value?.lank === vid.lank) {
    currentCastUrl.value = url;
  }
};

watch(currentVideo, (newVid) => {
  currentCastUrl.value = '';
  if (newVid) {
    updateCastUrl(newVid);
  }
}, { immediate: true });

const onPlay = () => {
  if (currentVideo.value) emit('play', currentVideo.value);
};

const onCast = async (e: MouseEvent) => {
  e.stopPropagation();
  if (currentVideo.value) {
    emit('cast', currentVideo.value);
    const langObj = store.getSiteLanguageObj || { code: 'E' };
    const subLangObj = store.getSubtitleLanguageObj || { code: 'F' };
    await openChromecastForVideo(
      currentVideo.value,
      langObj.code,
      subLangObj.code,
      store.mediatorUrl,
      currentCastUrl.value
    );
  }
};
</script>

<template>
  <div class="hero-spotlight-wrap">
    <!-- Skeleton loader -->
    <div v-if="loading" class="hero-spotlight hero-spotlight--skeleton">
      <v-skeleton-loader type="image" height="380" class="w-100 rounded-xl"></v-skeleton-loader>
    </div>

    <!-- Featured Carousel Banner -->
    <div
      v-else-if="currentVideo"
      class="hero-spotlight"
      :style="{ backgroundImage: `url(${currentVideo.images?.lsr?.lg || ''})` }"
      @click="onPlay"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
      role="banner"
    >
      <!-- Multi-stop directional gradient -->
      <div class="hero-spotlight__overlay"></div>

      <!-- Top Segmented Timer Line & Carousel Controls -->
      <div class="hero-timer-bar-wrap" @click.stop>
        <div class="hero-timer-segments">
          <button
            v-for="(v, idx) in videos"
            :key="v.lank || idx"
            class="hero-timer-segment"
            :class="{ 'hero-timer-segment--active': idx === currentIndex }"
            @click="goToSlide(idx)"
            type="button"
            :title="v.title"
          >
            <div
              class="hero-timer-segment__fill"
              :style="{
                width:
                  idx < currentIndex
                    ? '100%'
                    : idx === currentIndex
                    ? `${progress}%`
                    : '0%'
              }"
            ></div>
          </button>
        </div>

        <!-- Controls: Pause/Resume + Prev/Next -->
        <div class="hero-carousel-controls">
          <button
            class="hero-ctrl-btn"
            @click="togglePause"
            type="button"
            :title="isPaused ? 'Resume auto-play' : 'Pause auto-play'"
            :aria-label="isPaused ? 'Resume' : 'Pause'"
          >
            <v-icon size="18">{{ isPaused ? 'mdi-play' : 'mdi-pause' }}</v-icon>
            <span v-if="isPaused" class="hero-paused-tag">PAUSED</span>
          </button>

          <button
            class="hero-ctrl-btn"
            @click="prevSlide"
            type="button"
            title="Previous release"
            aria-label="Previous slide"
          >
            <v-icon size="18">mdi-chevron-left</v-icon>
          </button>

          <button
            class="hero-ctrl-btn"
            @click="nextSlide"
            type="button"
            title="Next release"
            aria-label="Next slide"
          >
            <v-icon size="18">mdi-chevron-right</v-icon>
          </button>
        </div>
      </div>

      <!-- Content Container with animated slide info -->
      <transition name="hero-fade" mode="out-in">
        <div :key="currentVideo.lank" class="hero-spotlight__content">
          <!-- Eyebrow Pill -->
          <div class="hero-eyebrow">
            <span class="hero-eyebrow__pulse"></span>
            <span>{{ $t('hero.featuredTag') }} ({{ currentIndex + 1 }}/{{ videos.length }})</span>
            <span v-if="currentVideo.durationFormatted" class="hero-eyebrow__duration">
              • {{ currentVideo.durationFormatted }}
            </span>
          </div>

          <!-- Title -->
          <h2 class="hero-title" :title="currentVideo.title">
            {{ currentVideo.title }}
          </h2>

          <!-- Description -->
          <p v-if="currentVideo.description" class="hero-desc">
            {{ currentVideo.description }}
          </p>

          <!-- Action Buttons -->
          <div class="hero-actions" @click.stop>
            <button
              class="hero-btn hero-btn--primary"
              @click.stop="onPlay"
              type="button"
            >
              <v-icon size="20" class="mr-1">mdi-play</v-icon>
              <span>{{ $t('hero.playNow') }}</span>
            </button>

            <a
              v-if="currentCastUrl"
              :href="currentCastUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="hero-btn hero-btn--glass text-decoration-none"
              @click.stop
            >
              <v-icon size="20" class="mr-2">mdi-cast-connected</v-icon>
              <span>{{ $t('hero.castToTv') }}</span>
            </a>
            <button
              v-else
              class="hero-btn hero-btn--glass"
              @click.stop="onCast"
              type="button"
            >
              <v-icon size="20" class="mr-2">mdi-cast-connected</v-icon>
              <span>{{ $t('hero.castToTv') }}</span>
            </button>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.hero-spotlight-wrap {
  margin-bottom: 28px;
}

.hero-spotlight {
  position: relative;
  min-height: 380px;
  border-radius: 24px;
  background-size: cover;
  background-position: center 25%;
  background-repeat: no-repeat;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 45px -15px rgba(0, 0, 0, 0.8),
              0 0 25px 2px rgba(255, 71, 87, 0.08);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              background-image 0.5s ease-in-out;
}

.hero-spotlight:hover {
  transform: translateY(-2px);
  box-shadow: 0 24px 50px -12px rgba(0, 0, 0, 0.9),
              0 0 30px 4px rgba(255, 71, 87, 0.14);
}

.hero-spotlight--skeleton {
  cursor: default;
  transform: none !important;
}

.hero-spotlight__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(11, 14, 20, 0.96) 0%,
    rgba(11, 14, 20, 0.82) 45%,
    rgba(11, 14, 20, 0.4) 75%,
    rgba(11, 14, 20, 0.75) 100%
  ),
  linear-gradient(
    0deg,
    rgba(11, 14, 20, 0.95) 0%,
    rgba(11, 14, 20, 0.2) 60%,
    transparent 100%
  );
  pointer-events: none;
}

/* TOP TIMER BAR & CONTROLS */
.hero-timer-bar-wrap {
  position: relative;
  z-index: 3;
  padding: 18px 28px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hero-timer-segments {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 320px;
}

.hero-timer-segment {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  overflow: hidden;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.hero-timer-segment:hover {
  transform: scaleY(1.5);
  background: rgba(255, 255, 255, 0.3);
}

.hero-timer-segment__fill {
  height: 100%;
  background: #FF4757;
  border-radius: 4px;
  box-shadow: 0 0 8px rgba(255, 71, 87, 0.8);
  transition: width 0.05s linear;
}

.hero-carousel-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero-ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(11, 14, 20, 0.65);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  color: #E2E8F0;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hero-ctrl-btn:hover {
  background: rgba(255, 71, 87, 0.25);
  border-color: rgba(255, 71, 87, 0.45);
  color: #FFFFFF;
  transform: translateY(-1px);
}

.hero-paused-tag {
  color: #FFA502;
  font-size: 0.68rem;
  letter-spacing: 0.05em;
}

/* CONTENT CONTAINER */
.hero-spotlight__content {
  position: relative;
  z-index: 2;
  padding: 24px 36px 36px;
  max-width: 740px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 4px 12px;
  background: rgba(255, 71, 87, 0.15);
  border: 1px solid rgba(255, 71, 87, 0.35);
  border-radius: 20px;
  color: #FF6B81;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-eyebrow__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #FF4757;
  box-shadow: 0 0 8px #FF4757;
  animation: pulse-dot 1.8s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.hero-eyebrow__duration {
  color: #E2E8F0;
  font-weight: 500;
}

.hero-title {
  font-size: 2.1rem;
  font-weight: 900;
  line-height: 1.15;
  color: #FFFFFF;
  margin: 0;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

@media (max-width: 600px) {
  .hero-title {
    font-size: 1.4rem;
  }
  .hero-spotlight__content {
    padding: 20px 20px;
  }
}

.hero-desc {
  font-size: 0.95rem;
  line-height: 1.5;
  color: #CBD5E1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 22px;
  border-radius: 28px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
  user-select: none;
}

.hero-btn:hover {
  transform: translateY(-2px);
}

.hero-btn--primary {
  background: linear-gradient(135deg, #FF4757 0%, #E02E49 100%);
  color: #FFFFFF;
  box-shadow: 0 8px 20px rgba(255, 71, 87, 0.4);
}

.hero-btn--primary:hover {
  box-shadow: 0 10px 25px rgba(255, 71, 87, 0.55);
}

.hero-btn--glass {
  background: rgba(18, 22, 32, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #F8FAFC;
}

.hero-btn--glass:hover {
  background: rgba(30, 36, 51, 0.85);
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}

.hero-btn--subtle {
  background: transparent;
  color: #94A3B8;
  padding: 10px 16px;
}

.hero-btn--subtle:hover {
  color: #FFFFFF;
}

/* FADE TRANSITION FOR CAROUSEL SLIDES */
.hero-fade-enter-active,
.hero-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.hero-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.hero-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
