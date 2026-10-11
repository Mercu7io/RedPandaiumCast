<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/store/app';
import { Video, PlaybackHistoryItem } from '@/types';

const emit = defineEmits<{
  (e: 'play', video: Video): void;
}>();

const store = useAppStore();
const { t } = useI18n();

const historyItems = computed(() => store.playbackHistory);

const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const resumeVideo = (item: PlaybackHistoryItem) => {
  store.setSelectedVideo(item.video);
  store.setVideoDialog(true);
  emit('play', item.video);
};

const removeItem = (lank: string, event: MouseEvent) => {
  event.stopPropagation();
  store.removePlaybackHistory(lank);
};
</script>

<template>
  <section v-if="historyItems.length > 0" class="continue-watching-section mb-10">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center">
        <v-icon size="24" color="primary" class="mr-2">mdi-history</v-icon>
        <h2 class="continue-title text-h5 font-weight-black">
          {{ $t('history.title') }}
        </h2>
        <span class="history-count ml-3">{{ historyItems.length }}</span>
      </div>
      <v-btn
        variant="text"
        size="small"
        color="grey"
        prepend-icon="mdi-delete-sweep-outline"
        @click="store.clearPlaybackHistory"
      >
        {{ $t('history.clear') }}
      </v-btn>
    </div>

    <!-- Cards Scroll Track -->
    <div class="continue-track">
      <div
        v-for="item in historyItems"
        :key="item.video.lank"
        class="continue-card"
        @click="resumeVideo(item)"
        role="button"
        tabindex="0"
      >
        <!-- Thumbnail Wrap -->
        <div class="continue-thumb">
          <img
            v-if="item.video.images?.lsr?.lg"
            :src="item.video.images.lsr.lg"
            :alt="item.video.title"
            class="continue-img"
            loading="lazy"
          />
          <div v-else class="continue-placeholder">
            <v-icon size="36" color="grey">mdi-play-circle-outline</v-icon>
          </div>

          <!-- Play button overlay -->
          <div class="continue-play-overlay">
            <v-icon size="32" color="white">mdi-play-circle</v-icon>
          </div>

          <!-- Dismiss cross button -->
          <button
            class="continue-dismiss-btn"
            @click="removeItem(item.video.lank, $event)"
            type="button"
            title="Remove from history"
            aria-label="Remove"
          >
            <v-icon size="14">mdi-close</v-icon>
          </button>

          <!-- Progress Bar on Bottom of Thumbnail -->
          <div class="continue-progress-wrap">
            <div
              class="continue-progress-bar"
              :style="{ width: item.duration > 0 ? `${Math.min(100, (item.time / item.duration) * 100)}%` : '0%' }"
            ></div>
          </div>
        </div>

        <!-- Info -->
        <div class="continue-info">
          <h3 class="continue-video-title" :title="item.video.title">
            {{ item.video.title }}
          </h3>
          <div class="continue-meta">
            <span class="continue-time">{{ $t('history.resume', { time: formatTime(item.time) }) }}</span>
            <span v-if="item.duration > 0" class="continue-duration">/ {{ formatTime(item.duration) }}</span>
          </div>
        </div>
      </div>
    </div>

    <v-divider class="category-divider mt-10"></v-divider>
  </section>
</template>

<style scoped>
.continue-watching-section {
  position: relative;
}

.continue-title {
  color: var(--app-text-primary, #F8FAFC);
  letter-spacing: -0.02em;
}

.history-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  background: var(--app-input-bg, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--app-text-secondary, #94A3B8);
}

.continue-track {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
}

.continue-card {
  flex: 0 0 260px;
  background: var(--app-card, #141923);
  border: 1px solid var(--app-card-border, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
  user-select: none;
}

.continue-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 71, 87, 0.4);
  box-shadow: 0 12px 28px -8px rgba(0, 0, 0, 0.35);
}

.continue-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #0d111a;
  overflow: hidden;
}

.continue-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.continue-card:hover .continue-img {
  transform: scale(1.05);
}

.continue-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.continue-card:hover .continue-play-overlay {
  opacity: 1;
}

.continue-dismiss-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #F8FAFC;
  cursor: pointer;
  z-index: 4;
  transition: all 0.18s ease;
}

.continue-dismiss-btn:hover {
  background: #FF4757;
  color: #FFFFFF;
  transform: scale(1.1);
}

.continue-progress-wrap {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.6);
  z-index: 3;
}

.continue-progress-bar {
  height: 100%;
  background: #FF4757;
  border-radius: 0 2px 2px 0;
}

.continue-info {
  padding: 10px 12px 12px;
}

.continue-video-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--app-text-primary, #F1F5F9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0 4px;
}

.continue-meta {
  font-size: 0.74rem;
  color: var(--app-text-secondary, #94A3B8);
  font-weight: 500;
}

.continue-time {
  color: #FF6B81;
}

.category-divider {
  border-color: var(--app-card-border, rgba(255, 255, 255, 0.06)) !important;
}
</style>
