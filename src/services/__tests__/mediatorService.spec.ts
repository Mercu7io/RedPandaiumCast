import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  extractBestImageUrl,
  formatMediaNodeToVideo,
  extractSubtitleVtt,
  mediatorService
} from '../mediatorService';

describe('mediatorService unit tests', () => {
  beforeEach(() => {
    mediatorService.clearCache();
    vi.restoreAllMocks();
  });
  it('extractBestImageUrl selects highest resolution available', () => {
    const imagesWithXl = {
      lsr: { xl: 'https://cdn/xl.jpg', lg: 'https://cdn/lg.jpg' }
    };
    expect(extractBestImageUrl(imagesWithXl)).toBe('https://cdn/xl.jpg');

    const imagesWithLgOnly = {
      lsr: { lg: 'https://cdn/lg.jpg' }
    };
    expect(extractBestImageUrl(imagesWithLgOnly)).toBe('https://cdn/lg.jpg');

    const emptyImages = {};
    expect(extractBestImageUrl(emptyImages)).toBe('');
    expect(extractBestImageUrl(null)).toBe('');
  });

  it('formatMediaNodeToVideo maps raw media node accurately', () => {
    const rawNode = {
      languageAgnosticNaturalKey: 'pub-jwbm_2024_1',
      title: 'Sample Title',
      description: 'Sample Description',
      images: {
        lsr: { lg: 'https://cdn/thumb.jpg' }
      },
      shareUrl: 'https://jw.org/sample',
      durationFormattedHHMM: '14:20'
    };

    const video = formatMediaNodeToVideo(rawNode);
    expect(video.lank).toBe('pub-jwbm_2024_1');
    expect(video.title).toBe('Sample Title');
    expect(video.description).toBe('Sample Description');
    expect(video.images.lsr.lg).toBe('https://cdn/thumb.jpg');
    expect(video.url).toBe('https://jw.org/sample');
    expect(video.durationFormatted).toBe('14:20');
  });

  it('extractSubtitleVtt extracts VTT from subtitles array or files array', () => {
    const nodeWithSubtitles = {
      subtitles: [
        { file: { url: 'https://cdn/sub.vtt' } }
      ]
    };
    expect(extractSubtitleVtt(nodeWithSubtitles)).toBe('https://cdn/sub.vtt');

    const nodeWithFiles = {
      files: [
        { progressiveDownloadURL: 'https://cdn/fallback.vtt' }
      ]
    };
    expect(extractSubtitleVtt(nodeWithFiles)).toBe('https://cdn/fallback.vtt');
    expect(extractSubtitleVtt({})).toBe('');
    expect(extractSubtitleVtt(null)).toBe('');
  });

  it('fetchVideoCategories handles successful response', async () => {
    const mockCategories = [
      { key: 'VODChildren', name: 'Children', type: 'container' },
      { key: 'VODFamily', name: 'Family', type: 'container' }
    ];
    vi.spyOn(axios, 'get').mockResolvedValueOnce({
      data: { category: { subcategories: mockCategories } }
    });

    const categories = await mediatorService.fetchVideoCategories('E');
    expect(categories).toHaveLength(2);
    expect(categories[0].key).toBe('VODChildren');
    expect(categories[1].name).toBe('Family');
  });

  it('fetchCategoryMedia handles container categories by fetching subcategory media', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: {
          category: {
            type: 'container',
            subcategories: [{ key: 'Child1' }]
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          category: {
            type: 'ondemand',
            media: [
              {
                naturalKey: 'video_1',
                title: 'Child Video 1',
                images: { lsr: { lg: 'https://cdn/1.jpg' } }
              }
            ]
          }
        }
      });

    const videos = await mediatorService.fetchCategoryMedia('VODChildren', 'E');
    expect(videos).toHaveLength(1);
    expect(videos[0].title).toBe('Child Video 1');
  });

  it('deduplicates concurrent calls to the same endpoint and reuses cached response', async () => {
    mediatorService.clearCache();
    const axiosSpy = vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        category: {
          type: 'ondemand',
          name: 'Talks',
          media: [
            {
              naturalKey: 'talk_1',
              title: 'Morning Talk',
              images: { lsr: { lg: 'https://cdn/talk.jpg' } }
            }
          ]
        }
      }
    });

    // Fire 2 calls simultaneously (deduplication check)
    const [res1, res2] = await Promise.all([
      mediatorService.fetchCategoryMedia('StudioTalks', 'E'),
      mediatorService.fetchCategoryMedia('StudioTalks', 'E')
    ]);

    expect(res1).toHaveLength(1);
    expect(res2).toHaveLength(1);
    expect(axiosSpy).toHaveBeenCalledTimes(1);

    // Third call after resolution should be returned from in-memory cache without hitting axios
    const res3 = await mediatorService.fetchCategoryMedia('StudioTalks', 'E');
    expect(res3).toHaveLength(1);
    expect(axiosSpy).toHaveBeenCalledTimes(1);
  });
});
