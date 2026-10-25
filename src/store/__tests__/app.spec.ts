import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from '../app';
import { Video } from '@/types';

const mockVideoA: Video = {
  lank: 'pub-test-a',
  title: 'Video A',
  description: 'Description A',
  images: { lsr: { lg: 'https://example.com/a.jpg' } },
};

const mockVideoB: Video = {
  lank: 'pub-test-b',
  title: 'Video B',
  description: 'Description B',
  images: { lsr: { lg: 'https://example.com/b.jpg' } },
};

describe('App Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('AI Feature Toggle', () => {
    it('initializes aiEnabled to true by default', () => {
      const store = useAppStore();
      expect(store.aiEnabled).toBe(true);
    });

    it('updates aiEnabled via setAiEnabled in standard mode', () => {
      const store = useAppStore();
      store.setIsPwa(false);
      store.setAiEnabled(false);
      expect(store.aiEnabled).toBe(false);

      store.setAiEnabled(true);
      expect(store.aiEnabled).toBe(true);
    });

    it('forces aiEnabled to false when isPwa is true', () => {
      const store = useAppStore();
      store.setIsPwa(true);
      expect(store.aiEnabled).toBe(false);

      // Attempting to re-enable AI in PWA mode must remain false
      store.setAiEnabled(true);
      expect(store.aiEnabled).toBe(false);
    });
  });

  describe('Theme Mode & Resolution', () => {
    it('defaults to dark theme mode', () => {
      const store = useAppStore();
      expect(store.themeMode).toBe('dark');
      expect(store.effectiveTheme).toBe('dark');
    });

    it('resolves light mode correctly', () => {
      const store = useAppStore();
      store.setThemeMode('light');
      expect(store.themeMode).toBe('light');
      expect(store.effectiveTheme).toBe('light');
    });

    it('resolves system mode based on systemPrefersDark', () => {
      const store = useAppStore();
      store.setThemeMode('system');

      store.systemPrefersDark = true;
      expect(store.effectiveTheme).toBe('dark');

      store.systemPrefersDark = false;
      expect(store.effectiveTheme).toBe('light');
    });
  });

  describe('Playback History (Continue Watching)', () => {
    it('records playback history for an in-progress video', () => {
      const store = useAppStore();
      store.recordPlayback(mockVideoA, 45, 120);

      expect(store.playbackHistory).toHaveLength(1);
      expect(store.playbackHistory[0].video.lank).toBe(mockVideoA.lank);
      expect(store.playbackHistory[0].time).toBe(45);
      expect(store.playbackHistory[0].duration).toBe(120);
    });

    it('updates timestamp and re-orders when the same video is watched again', () => {
      const store = useAppStore();
      store.recordPlayback(mockVideoA, 10, 100);
      store.recordPlayback(mockVideoB, 20, 100);
      expect(store.playbackHistory[0].video.lank).toBe(mockVideoB.lank);

      // Re-watch Video A with updated time
      store.recordPlayback(mockVideoA, 50, 100);
      expect(store.playbackHistory[0].video.lank).toBe(mockVideoA.lank);
      expect(store.playbackHistory[0].time).toBe(50);
      expect(store.playbackHistory).toHaveLength(2);
    });

    it('removes video from history when completed within 5 seconds of duration', () => {
      const store = useAppStore();
      store.recordPlayback(mockVideoA, 30, 100);
      expect(store.playbackHistory).toHaveLength(1);

      // Video finishes at 96s out of 100s (within 5s)
      store.recordPlayback(mockVideoA, 96, 100);
      expect(store.playbackHistory).toHaveLength(0);
    });

    it('ignores invalid videos or non-positive playback times', () => {
      const store = useAppStore();
      store.recordPlayback({ lank: '', title: '', description: '', images: { lsr: { lg: '' } } }, 10, 100);
      store.recordPlayback(mockVideoA, 0, 100);
      store.recordPlayback(mockVideoA, -5, 100);
      expect(store.playbackHistory).toHaveLength(0);
    });

    it('can remove a specific item or clear all history', () => {
      const store = useAppStore();
      store.recordPlayback(mockVideoA, 20, 100);
      store.recordPlayback(mockVideoB, 30, 100);
      expect(store.playbackHistory).toHaveLength(2);

      store.removePlaybackHistory(mockVideoA.lank);
      expect(store.playbackHistory).toHaveLength(1);
      expect(store.playbackHistory[0].video.lank).toBe(mockVideoB.lank);

      store.clearPlaybackHistory();
      expect(store.playbackHistory).toHaveLength(0);
    });
  });

  describe('Favorites System', () => {
    it('toggles video into favorites and reports isFavorite correctly', () => {
      const store = useAppStore();
      expect(store.isFavorite(mockVideoA.lank)).toBe(false);

      // Add to favorites
      store.toggleFavorite(mockVideoA);
      expect(store.isFavorite(mockVideoA.lank)).toBe(true);
      expect(store.favorites).toHaveLength(1);
      expect(store.favorites[0].lank).toBe(mockVideoA.lank);

      // Remove from favorites
      store.toggleFavorite(mockVideoA);
      expect(store.isFavorite(mockVideoA.lank)).toBe(false);
      expect(store.favorites).toHaveLength(0);
    });

    it('ignores empty or invalid video without throwing', () => {
      const store = useAppStore();
      store.toggleFavorite({ lank: '', title: '', description: '', images: { lsr: { lg: '' } } });
      expect(store.favorites).toHaveLength(0);
    });
  });
});
