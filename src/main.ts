import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';
import { registerSW } from 'virtual:pwa-register';

// Auto-updating Service Worker for offline asset caching and seamless updates
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New version detected, updating Service Worker immediately...');
    updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates periodically (every 10 minutes) and upon tab focus
      setInterval(() => {
        registration.update();
      }, 10 * 60 * 1000);
      window.addEventListener('focus', () => {
        registration.update();
      });
    }
  },
});

// Auto-reload window when new service worker takes control
let refreshing = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!refreshing) {
    refreshing = true;
    console.log('[PWA] Service worker controller changed, reloading page...');
    window.location.reload();
  }
});

// Vuetify
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import '@mdi/font/css/materialdesignicons.css';

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'dark',
    themes: {
      light: {
        colors: {
          background: '#F8FAFC',
          surface: '#FFFFFF',
          primary: '#FF4757',
          secondary: '#64748B',
          accent: '#0EA5E9',
          error: '#EF4444',
          info: '#38BDF8',
          success: '#10B981',
          warning: '#F59E0B',
        },
      },
      dark: {
        colors: {
          background: '#0B0E14',
          surface: '#121620',
          primary: '#FF4757', // Red Panda Coral
          secondary: '#1E2433',
          accent: '#38BDF8',
          error: '#FF4757',
          info: '#38BDF8',
          success: '#2ED573',
          warning: '#FFA502',
        },
      },
    },
  },
});

import { i18n } from './i18n';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.use(i18n);
app.mount('#app');
