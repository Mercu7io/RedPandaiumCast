<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/store/app';
import { whatsappChannels } from '@/config/whatsappChannels';

const store = useAppStore();

const dialog = computed({
  get: () => store.getNotifiedDialog,
  set: (val) => store.setGetNotifiedDialog(val)
});

const channel = computed(() => {
  return whatsappChannels[store.siteLanguage] || whatsappChannels['en'];
});
</script>

<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card rounded="xl">
      <v-toolbar color="primary" dark>
        <v-toolbar-title>{{ channel.ctaLabel }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="dialog = false"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-6 text-center">
        <v-icon size="64" color="success" class="mb-4">mdi-whatsapp</v-icon>
        <p class="text-body-1 mb-6">{{ channel.description }}</p>
        <v-btn
          color="success"
          size="x-large"
          rounded="pill"
          elevation="2"
          :href="channel.link"
          target="_blank"
          @click="dialog = false"
        >
          <v-icon left class="mr-2">mdi-whatsapp</v-icon>
          {{ channel.buttonLabel }}
        </v-btn>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
