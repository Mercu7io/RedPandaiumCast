<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Video } from '@/types';
import { useAppStore } from '@/store/app';

const props = defineProps<{
  video: Video;
}>();

const emit = defineEmits<{
  (e: 'select', video: Video): void;
  (e: 'cast', video: Video): void;
  (e: 'subtitles', video: Video): void;
}>();

const store = useAppStore();
const { t } = useI18n();
const isHovered = ref(false);

const onCardClick = () => {
  emit('select', props.video);
};

const onQuickCast = (event: MouseEvent) => {
  event.stopPropagation();
  emit('cast', props.video);
};

const onQuickSubtitles = (event: MouseEvent) => {
  event.stopPropagation();
  emit('subtitles', props.video);
};
</script>

<template>
  <div
    class="bento-card"
    :class="{ 'bento-card--hovered': isHovered }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @click="onCardClick"
    role="button"
    tabindex="0"
    @keydown.enter="onCardClick"
  >
    <!-- Thumbnail Container -->
    <div class="bento-card__thumb-wrap">
      <img
        v-if="video.images?.lsr?.lg"
        :src="video.images.lsr.lg"
        :alt="video.title"
        class="bento-card__img"
        loading="lazy"
      />
      <div v-else class="bento-card__placeholder">
        <v-icon size="48" color="grey-darken-1">mdi-movie-open-outline</v-icon>
      </div>

      <!-- Gradient mask -->
      <div class="bento-card__gradient"></div>

      <!-- Duration Badge -->
      <div v-if="video.durationFormatted" class="bento-card__duration-badge">
        <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>
        <span>{{ video.durationFormatted }}</span>
      </div>

      <!-- Language Badge -->
      <div class="bento-card__lang-badge">
        <span>{{ (store.siteLanguage || 'EN').toUpperCase() }}</span>
      </div>

      <!-- Quick Action Floating Overlay -->
      <div class="bento-card__actions" :class="{ 'bento-card__actions--visible': isHovered }" @click="onCardClick">
        <button
          class="bento-action-btn bento-action-btn--play"
          :title="$t('card.play')"
          @click.stop="onCardClick"
          type="button"
          aria-label="Play"
        >
          <v-icon size="18">mdi-play</v-icon>
          <span class="action-text">{{ $t('card.play') }}</span>
        </button>

        <button
          class="bento-action-btn bento-action-btn--cast"
          :title="$t('card.quickCast')"
          @click.stop="onQuickCast"
          type="button"
          aria-label="Quick Cast"
        >
          <v-icon size="18">mdi-cast</v-icon>
          <span class="action-text">{{ $t('card.quickCast') }}</span>
        </button>

        <button
          v-if="store.aiEnabled"
          class="bento-action-btn bento-action-btn--subtitles"
          :title="$t('card.subtitles')"
          @click.stop="onQuickSubtitles"
          type="button"
          aria-label="Subtitles"
        >
          <v-icon size="18">mdi-subtitles-outline</v-icon>
          <span class="action-text">{{ $t('card.subtitles') }}</span>
        </button>
      </div>
    </div>

    <!-- Title & Details -->
    <div class="bento-card__info">
      <h3 class="bento-card__title" :title="video.title">
        {{ video.title }}
      </h3>
      <div class="bento-card__meta">
        <span class="meta-tag">JW Media</span>
        <span v-if="video.durationFormatted" class="meta-dot">•</span>
        <span v-if="video.durationFormatted" class="meta-duration">{{ video.durationFormatted }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bento-card {
  display: flex;
  flex-direction: column;
  background: #141923;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.28s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.28s ease;
  user-select: none;
  height: 100%;
}

.bento-card:hover,
.bento-card--hovered {
  transform: translateY(-5px);
  border-color: rgba(255, 71, 87, 0.45);
  box-shadow: 0 16px 36px -10px rgba(0, 0, 0, 0.7),
              0 0 20px 2px rgba(255, 71, 87, 0.18);
}

.bento-card:focus-visible {
  outline: 2px solid #FF4757;
  outline-offset: 2px;
}

.bento-card__thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #0d111a;
  overflow: hidden;
}

.bento-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.bento-card:hover .bento-card__img {
  transform: scale(1.04);
}

.bento-card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #1a202c;
}

.bento-card__gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0) 45%,
    rgba(11, 14, 20, 0.85) 100%
  );
  pointer-events: none;
}

.bento-card__duration-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  background: rgba(11, 14, 20, 0.82);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #F8FAFC;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  z-index: 2;
}

.bento-card__lang-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  background: rgba(255, 71, 87, 0.85);
  border-radius: 6px;
  color: #FFFFFF;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  z-index: 2;
}

.bento-card__actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(11, 14, 20, 0.6);
  backdrop-filter: blur(4px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;
  z-index: 3;
}

.bento-card__actions--visible {
  opacity: 1;
  pointer-events: auto;
}

.bento-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: transform 0.18s ease, filter 0.18s ease;
}

.bento-action-btn:hover {
  transform: scale(1.06);
}

.bento-action-btn--play {
  background: #FF4757;
  color: #FFFFFF;
  box-shadow: 0 4px 12px rgba(255, 71, 87, 0.45);
}

.bento-action-btn--cast {
  background: rgba(18, 22, 32, 0.85);
  color: #F8FAFC;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.bento-action-btn--subtitles {
  background: rgba(255, 255, 255, 0.9);
  color: #0F172A;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.bento-card__info {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bento-card__title {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.35;
  color: #F1F5F9;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.bento-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #94A3B8;
}

.meta-tag {
  color: #FF6B81;
  font-weight: 500;
}

.meta-dot {
  opacity: 0.5;
}
</style>
