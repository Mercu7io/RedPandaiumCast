import axios from 'axios';
import { Language, Video } from '@/types';

export const DEFAULT_MEDIATOR_URL = 'https://b.jw-cdn.org/apis/mediator/v1';

// Cache TTLs in milliseconds
const TTL_LANGUAGES_MS = 24 * 60 * 60 * 1000; // 24 hours
const TTL_TRANSLATIONS_MS = 24 * 60 * 60 * 1000; // 24 hours
const TTL_CATEGORY_MS = 5 * 60 * 1000; // 5 minutes
const TTL_MEDIA_ITEM_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// In-memory cache map
const memoryCache = new Map<string, CacheEntry<any>>();

// In-flight request deduplication map to prevent parallel duplicate HTTP calls
const inFlightRequests = new Map<string, Promise<any>>();

export function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function clearMediatorCache(): void {
  memoryCache.clear();
  inFlightRequests.clear();
}

/**
 * Deduplicates concurrent identical requests by sharing the in-flight Promise.
 */
export async function deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }

  const promise = requestFn()
    .then((result) => {
      inFlightRequests.delete(key);
      return result;
    })
    .catch((err) => {
      inFlightRequests.delete(key);
      throw err;
    });

  inFlightRequests.set(key, promise);
  return promise;
}

export function extractBestImageUrl(images: any, preferThumbnail: boolean = false): string {
  if (!images) return '';
  if (preferThumbnail) {
    return (
      images.lsr?.sm ||
      images.lsr?.md ||
      images.sqr?.sm ||
      images.pnr?.sm ||
      images.lsr?.lg ||
      images.wss?.lg ||
      ''
    );
  }
  return (
    images.lsr?.xl ||
    images.lsr?.lg ||
    images.wss?.lg ||
    images.pnr?.lg ||
    images.sqr?.lg ||
    images.lsr?.sm ||
    ''
  );
}

export function formatMediaNodeToVideo(m: any): Video {
  return {
    lank: m.languageAgnosticNaturalKey || m.naturalKey || m.lank || '',
    title: m.title || '',
    description: m.description || '',
    images: {
      lsr: {
        lg: extractBestImageUrl(m.images),
      },
    },
    url: m.shareUrl || '',
    durationFormatted: m.durationFormattedHHMM || m.durationFormattedMinSec || '',
  };
}

export function extractSubtitleVtt(mediaNode: any): string {
  if (!mediaNode) return '';
  if (mediaNode.subtitles && mediaNode.subtitles.length > 0) {
    const found = mediaNode.subtitles.find((s: any) => s.file?.url?.endsWith('.vtt'));
    if (found?.file?.url) return found.file.url;
  }
  if (mediaNode.files && mediaNode.files.length > 0) {
    const fileWithSub = mediaNode.files.find((f: any) => f.subtitles?.url?.endsWith('.vtt'));
    if (fileWithSub?.subtitles?.url) return fileWithSub.subtitles.url;

    const fileVtt = mediaNode.files.find((f: any) => f.progressiveDownloadURL?.endsWith('.vtt'));
    if (fileVtt?.progressiveDownloadURL) return fileVtt.progressiveDownloadURL;
  }
  return '';
}

export const mediatorService = {
  async fetchLanguages(mediatorUrl: string = DEFAULT_MEDIATOR_URL): Promise<Language[]> {
    const cacheKey = `languages_${mediatorUrl}`;
    const cached = getCached<Language[]>(cacheKey);
    if (cached) return cached;

    // Check localStorage for persisted languages
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('jwcast_languages_cache');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.expiresAt && Date.now() < parsed.expiresAt && Array.isArray(parsed.languages)) {
            setCached(cacheKey, parsed.languages, parsed.expiresAt - Date.now());
            return parsed.languages;
          }
        }
      } catch (_) {}
    }

    return deduplicateRequest(cacheKey, async () => {
      const url = `${mediatorUrl}/languages/en/all?clientType=www`;
      const { data } = await axios.get(url);
      const langs: Language[] = data.languages || [];

      const pinned = ['nl', 'en', 'fr'];
      const sorted = [...langs].sort((a, b) => {
        const aPinned = pinned.includes(a.locale);
        const bPinned = pinned.includes(b.locale);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return a.name.localeCompare(b.name);
      });

      setCached(cacheKey, sorted, TTL_LANGUAGES_MS);

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('jwcast_languages_cache', JSON.stringify({
            languages: sorted,
            expiresAt: Date.now() + TTL_LANGUAGES_MS,
          }));
        } catch (_) {}
      }

      return sorted;
    });
  },

  async fetchTranslations(langCode: string, mediatorUrl: string = DEFAULT_MEDIATOR_URL): Promise<Record<string, any>> {
    const cacheKey = `translations_${langCode}_${mediatorUrl}`;
    const cached = getCached<Record<string, any>>(cacheKey);
    if (cached) return cached;

    return deduplicateRequest(cacheKey, async () => {
      const url = `${mediatorUrl}/translations/${langCode}`;
      const { data } = await axios.get(url);
      const translations = data.translations?.[langCode] || {};
      setCached(cacheKey, translations, TTL_TRANSLATIONS_MS);
      return translations;
    });
  },

  async fetchVideoCategories(
    langCode: string = 'E',
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<{ key: string; name: string; type: string }[]> {
    const cacheKey = `categories_${langCode}_${mediatorUrl}`;
    const cached = getCached<{ key: string; name: string; type: string }[]>(cacheKey);
    if (cached) return cached;

    return deduplicateRequest(cacheKey, async () => {
      try {
        const url = `${mediatorUrl}/categories/${langCode}/VideoOnDemand?detailed=1&clientType=www`;
        const { data } = await axios.get(url);
        const subs = data.category?.subcategories || [];
        setCached(cacheKey, subs, TTL_CATEGORY_MS);
        return subs;
      } catch (err) {
        console.error('Failed to fetch video categories:', err);
        return [];
      }
    });
  },

  async fetchCategoryDetails(
    categoryName: string,
    langCode: string = 'E',
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<any> {
    const cacheKey = `cat_details_${categoryName}_${langCode}_${mediatorUrl}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;

    return deduplicateRequest(cacheKey, async () => {
      try {
        const url = `${mediatorUrl}/categories/${langCode}/${categoryName}?detailed=1&clientType=www`;
        const { data } = await axios.get(url);
        const category = data.category || null;
        if (category) {
          setCached(cacheKey, category, TTL_CATEGORY_MS);
        }
        return category;
      } catch (err) {
        console.error(`Failed to fetch category details for ${categoryName}:`, err);
        return null;
      }
    });
  },

  async fetchCategoryMedia(
    categoryName: string,
    langCode: string = 'E',
    limit: number = 0,
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<Video[]> {
    const cacheKey = `cat_media_${categoryName}_${langCode}_${limit}_${mediatorUrl}`;
    const cached = getCached<Video[]>(cacheKey);
    if (cached) return cached;

    return deduplicateRequest(cacheKey, async () => {
      try {
        // Reuse cached category details if already fetched
        const detailsKey = `cat_details_${categoryName}_${langCode}_${mediatorUrl}`;
        let category = getCached<any>(detailsKey);

        if (!category) {
          const url = `${mediatorUrl}/categories/${langCode}/${categoryName}?detailed=1&clientType=www`;
          const { data } = await axios.get(url);
          category = data.category;
          if (category) {
            setCached(detailsKey, category, TTL_CATEGORY_MS);
          }
        }

        // If category is a container (e.g. VODChildren, VODFamily, VODBible), fetch media across subcategories
        if (category?.type === 'container' && category?.subcategories?.length) {
          // Optimization: if a small limit is requested (e.g., 6 items on home row), only fetch the first few subcategories
          const subcategoriesToFetch = limit > 0 && limit <= 6
            ? category.subcategories.slice(0, 3)
            : category.subcategories;

          const subPromises = subcategoriesToFetch.map((sub: any) => {
            const subCacheKey = `subcat_media_${sub.key}_${langCode}_${mediatorUrl}`;
            const cachedSub = getCached<any[]>(subCacheKey);
            if (cachedSub) return Promise.resolve(cachedSub);

            return deduplicateRequest(subCacheKey, async () => {
              try {
                const res = await axios.get(`${mediatorUrl}/categories/${langCode}/${sub.key}?clientType=www`);
                const media = res.data?.category?.media || [];
                setCached(subCacheKey, media, TTL_CATEGORY_MS);
                return media;
              } catch {
                return [];
              }
            });
          });

          const mediaArrays = await Promise.all(subPromises);
          const rawMedia = mediaArrays.flat();
          let formatted = rawMedia.map(formatMediaNodeToVideo);
          if (limit > 0) {
            formatted = formatted.slice(0, limit);
          }
          setCached(cacheKey, formatted, TTL_CATEGORY_MS);
          return formatted;
        }

        // If category is ondemand with direct media
        const rawMedia = category?.media || [];
        let formatted = rawMedia.map(formatMediaNodeToVideo);
        if (limit > 0) {
          formatted = formatted.slice(0, limit);
        }
        setCached(cacheKey, formatted, TTL_CATEGORY_MS);
        return formatted;
      } catch (err) {
        console.error(`Failed to fetch media for ${categoryName}:`, err);
        return [];
      }
    });
  },

  async fetchMediaItem(
    lank: string,
    langCode: string = 'E',
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<any | null> {
    const cacheKey = `media_item_${lank}_${langCode}_${mediatorUrl}`;
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;

    return deduplicateRequest(cacheKey, async () => {
      const url = `${mediatorUrl}/media-items/${langCode}/${lank}?clientType=www`;
      const { data } = await axios.get(url);
      const mediaItem = data.media?.[0] || null;
      if (mediaItem) {
        setCached(cacheKey, mediaItem, TTL_MEDIA_ITEM_MS);
      }
      return mediaItem;
    });
  },

  clearCache: clearMediatorCache,
};
