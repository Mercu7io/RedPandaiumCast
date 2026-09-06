<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const { t } = useI18n();

const closeDialog = () => {
  emit('update:modelValue', false);
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="680"
    scrollable
  >
    <div class="help-modal">
      <!-- Header -->
      <div class="help-header">
        <div class="d-flex align-center">
          <v-icon size="28" color="primary" class="mr-2">mdi-paw</v-icon>
          <h2 class="help-title">
            RedPandaium <span class="brand-accent">CAST</span>
            <span class="help-subtitle ml-2">• {{ $t('help.title') }}</span>
          </h2>
        </div>
        <button class="help-close-btn" @click="closeDialog" aria-label="Close help modal">
          <v-icon size="20">mdi-close</v-icon>
        </button>
      </div>

      <!-- Scrollable Body -->
      <div class="help-body">
        <!-- Inspiration & Attribution Banner -->
        <div class="attribution-card mb-6">
          <div class="d-flex align-center mb-2">
            <v-icon size="20" color="info" class="mr-2">mdi-information-outline</v-icon>
            <span class="text-subtitle-2 font-weight-bold text-white">About RedPandaium Cast</span>
          </div>
          <p class="attribution-text mb-2">
            {{ $t('help.attribution') }}
            <a
              href="https://github.com/semkeijsper/jw-cast"
              target="_blank"
              rel="noopener noreferrer"
              class="attribution-link"
            >
              https://github.com/semkeijsper/jw-cast
              <v-icon size="14" class="ml-1">mdi-open-in-new</v-icon>
            </a>
          </p>
          <div class="attribution-note">
            RedPandaium Cast extends the original project with automated Docker builds, Groq AI speech-to-text transcription, on-the-fly multilingual translation, PIN security, and the Streaming Bento UI.
          </div>
        </div>

        <!-- Features Section -->
        <h3 class="section-heading mb-4">{{ $t('help.featuresTitle') }}</h3>

        <div class="features-grid mb-6">
          <!-- Chromecast -->
          <div class="feature-item">
            <div class="feature-icon-wrap feature-icon-wrap--cast">
              <v-icon size="24" color="primary">mdi-cast-connected</v-icon>
            </div>
            <div class="feature-details">
              <h4 class="feature-title">{{ $t('help.featureCastTitle') }}</h4>
              <p class="feature-desc">{{ $t('help.featureCastDesc') }}</p>
            </div>
          </div>

          <!-- AI Subtitles -->
          <div class="feature-item">
            <div class="feature-icon-wrap feature-icon-wrap--ai">
              <v-icon size="24" color="info">mdi-creation-outline</v-icon>
            </div>
            <div class="feature-details">
              <h4 class="feature-title">{{ $t('help.featureSubtitlesTitle') }}</h4>
              <p class="feature-desc">{{ $t('help.featureSubtitlesDesc') }}</p>
            </div>
          </div>

          <!-- PIN Security -->
          <div class="feature-item">
            <div class="feature-icon-wrap feature-icon-wrap--security">
              <v-icon size="24" color="success">mdi-shield-lock-outline</v-icon>
            </div>
            <div class="feature-details">
              <h4 class="feature-title">{{ $t('help.featureSecurityTitle') }}</h4>
              <p class="feature-desc">{{ $t('help.featureSecurityDesc') }}</p>
            </div>
          </div>
        </div>

        <!-- Keyboard Shortcuts Section -->
        <h3 class="section-heading mb-3">{{ $t('help.featureShortcutsTitle') }}</h3>
        <div class="shortcuts-card mb-4">
          <div class="shortcut-row">
            <span class="shortcut-action">{{ $t('help.shortcutSearch') }}</span>
            <div class="shortcut-keys">
              <kbd class="kbd-key">Ctrl</kbd>
              <span class="kbd-plus">+</span>
              <kbd class="kbd-key">K</kbd>
            </div>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-action">{{ $t('help.shortcutClose') }}</span>
            <div class="shortcut-keys">
              <kbd class="kbd-key">Esc</kbd>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="help-footer">
        <button class="help-done-btn" @click="closeDialog" type="button">
          {{ $t('player.close') || 'Close' }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.help-modal {
  background: rgba(18, 22, 32, 0.96);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.9);
  color: #F8FAFC;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}

.help-header {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.help-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #FFFFFF;
  margin: 0;
  display: flex;
  align-items: center;
}

.brand-accent {
  color: #FF4757;
  font-weight: 900;
}

.help-subtitle {
  font-size: 0.88rem;
  font-weight: 600;
  color: #94A3B8;
}

.help-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #CBD5E1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-close-btn:hover {
  background: rgba(255, 71, 87, 0.2);
  border-color: rgba(255, 71, 87, 0.4);
  color: #FFFFFF;
}

.help-body {
  padding: 24px;
  overflow-y: auto;
}

/* Attribution Card */
.attribution-card {
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(14, 165, 233, 0.25);
  border-radius: 16px;
  padding: 16px 18px;
}

.attribution-text {
  font-size: 0.88rem;
  color: #E2E8F0;
  line-height: 1.5;
}

.attribution-link {
  color: #38BDF8;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  word-break: break-all;
}

.attribution-link:hover {
  text-decoration: underline;
  color: #7DD3FC;
}

.attribution-note {
  font-size: 0.78rem;
  color: #94A3B8;
  line-height: 1.4;
  margin-top: 6px;
}

/* Sections */
.section-heading {
  font-size: 0.92rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94A3B8;
}

/* Features Grid */
.features-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
}

.feature-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.feature-icon-wrap--cast {
  background: rgba(255, 71, 87, 0.15);
  border: 1px solid rgba(255, 71, 87, 0.3);
}

.feature-icon-wrap--ai {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.feature-icon-wrap--security {
  background: rgba(46, 213, 115, 0.15);
  border: 1px solid rgba(46, 213, 115, 0.3);
}

.feature-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #F8FAFC;
  margin: 0 0 4px;
}

.feature-desc {
  font-size: 0.82rem;
  color: #94A3B8;
  margin: 0;
  line-height: 1.4;
}

/* Shortcuts Card */
.shortcuts-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shortcut-action {
  font-size: 0.84rem;
  color: #CBD5E1;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 4px;
}

.kbd-key {
  display: inline-block;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  color: #F8FAFC;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: inherit;
}

.kbd-plus {
  font-size: 0.75rem;
  color: #64748B;
}

/* Footer */
.help-footer {
  padding: 16px 24px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.help-done-btn {
  padding: 8px 24px;
  background: #FF4757;
  color: #FFFFFF;
  border-radius: 20px;
  border: none;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-done-btn:hover {
  background: #E02E49;
  transform: translateY(-1px);
}
</style>
