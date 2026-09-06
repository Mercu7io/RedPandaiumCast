import axios from 'axios';
import { Language, Video } from '@/types';

export const DEFAULT_MEDIATOR_URL = 'https://b.jw-cdn.org/apis/mediator/v1';

export function extractBestImageUrl(images: any): string {
  if (!images) return '';
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
    const url = `${mediatorUrl}/languages/en/all?clientType=www`;
    const { data } = await axios.get(url);
    const langs: Language[] = data.languages || [];

    const pinned = ['nl', 'en', 'fr'];
    return [...langs].sort((a, b) => {
      const aPinned = pinned.includes(a.locale);
      const bPinned = pinned.includes(b.locale);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return a.name.localeCompare(b.name);
    });
  },

  async fetchTranslations(langCode: string, mediatorUrl: string = DEFAULT_MEDIATOR_URL): Promise<Record<string, any>> {
    const url = `${mediatorUrl}/translations/${langCode}`;
    const { data } = await axios.get(url);
    return data.translations?.[langCode] || {};
  },

  async fetchVideoCategories(
    langCode: string = 'E',
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<{ key: string; name: string; type: string }[]> {
    try {
      const url = `${mediatorUrl}/categories/${langCode}/VideoOnDemand?detailed=1&clientType=www`;
      const { data } = await axios.get(url);
      return data.category?.subcategories || [];
    } catch (err) {
      console.error('Failed to fetch video categories:', err);
      return [];
    }
  },

  async fetchCategoryDetails(
    categoryName: string,
    langCode: string = 'E',
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<any> {
    try {
      const url = `${mediatorUrl}/categories/${langCode}/${categoryName}?detailed=1&clientType=www`;
      const { data } = await axios.get(url);
      return data.category || null;
    } catch (err) {
      console.error(`Failed to fetch category details for ${categoryName}:`, err);
      return null;
    }
  },

  async fetchCategoryMedia(
    categoryName: string,
    langCode: string = 'E',
    limit: number = 0,
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<Video[]> {
    try {
      const url = `${mediatorUrl}/categories/${langCode}/${categoryName}?detailed=1&clientType=www`;
      const { data } = await axios.get(url);
      const category = data.category;

      // If category is a container (e.g. VODChildren, VODFamily, VODBible), fetch media across subcategories
      if (category?.type === 'container' && category?.subcategories?.length) {
        const subPromises = category.subcategories.map((sub: any) =>
          axios
            .get(`${mediatorUrl}/categories/${langCode}/${sub.key}?clientType=www`)
            .then(res => res.data?.category?.media || [])
            .catch(() => [])
        );
        const mediaArrays = await Promise.all(subPromises);
        const rawMedia = mediaArrays.flat();
        let formatted = rawMedia.map(formatMediaNodeToVideo);
        if (limit > 0) {
          formatted = formatted.slice(0, limit);
        }
        return formatted;
      }

      // If category is ondemand with direct media
      const rawMedia = category?.media || [];
      let formatted = rawMedia.map(formatMediaNodeToVideo);
      if (limit > 0) {
        formatted = formatted.slice(0, limit);
      }
      return formatted;
    } catch (err) {
      console.error(`Failed to fetch media for ${categoryName}:`, err);
      return [];
    }
  },

  async fetchMediaItem(
    lank: string,
    langCode: string = 'E',
    mediatorUrl: string = DEFAULT_MEDIATOR_URL
  ): Promise<any | null> {
    const url = `${mediatorUrl}/media-items/${langCode}/${lank}?clientType=www`;
    const { data } = await axios.get(url);
    return data.media?.[0] || null;
  },
};
