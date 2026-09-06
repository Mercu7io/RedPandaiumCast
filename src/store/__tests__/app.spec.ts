import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from '../app';

describe('App Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes aiEnabled to true by default', () => {
    const store = useAppStore();
    expect(store.aiEnabled).toBe(true);
  });

  it('updates aiEnabled via setAiEnabled', () => {
    const store = useAppStore();
    store.setAiEnabled(false);
    expect(store.aiEnabled).toBe(false);

    store.setAiEnabled(true);
    expect(store.aiEnabled).toBe(true);
  });
});
