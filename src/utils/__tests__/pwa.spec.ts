import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isPwaMode } from '../pwa';

describe('PWA utility tests', () => {
  const originalWindow = (global as any).window;
  const originalDocument = (global as any).document;
  const originalLocalStorage = (global as any).localStorage;

  afterEach(() => {
    (global as any).window = originalWindow;
    (global as any).document = originalDocument;
    (global as any).localStorage = originalLocalStorage;
  });

  it('returns false when window is undefined (e.g. server/node environment)', () => {
    delete (global as any).window;
    expect(isPwaMode()).toBe(false);
  });

  it('detects standalone display-mode via matchMedia', () => {
    (global as any).window = {
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)',
      })),
      navigator: {},
      location: { search: '' },
    };

    expect(isPwaMode()).toBe(true);
  });

  it('detects iOS Safari standalone mode', () => {
    (global as any).window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      navigator: { standalone: true },
      location: { search: '' },
    };

    expect(isPwaMode()).toBe(true);
  });

  it('detects PWA via query parameter ?source=pwa', () => {
    (global as any).window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      navigator: {},
      location: { search: '?source=pwa' },
    };

    expect(isPwaMode()).toBe(true);
  });

  it('detects PWA via localStorage flag', () => {
    (global as any).window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      navigator: {},
      location: { search: '' },
    };
    (global as any).localStorage = {
      getItem: vi.fn().mockImplementation((key: string) => (key === 'jwcast_is_pwa' ? 'true' : null)),
    };

    expect(isPwaMode()).toBe(true);
  });

  it('returns false in standard browser mode', () => {
    (global as any).window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      navigator: {},
      location: { search: '' },
    };
    (global as any).localStorage = {
      getItem: vi.fn().mockReturnValue(null),
    };

    expect(isPwaMode()).toBe(false);
  });
});
