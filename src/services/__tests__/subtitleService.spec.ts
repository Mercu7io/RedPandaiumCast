import { describe, it, expect, vi } from 'vitest';
import { parseVttToText, blobUrlManager, buildChromecastUrl, safeBase64Encode, fetchChromecastUrl } from '../subtitleService';
import { mediatorService } from '../mediatorService';

describe('subtitleService unit tests', () => {
  it('parseVttToText correctly cleans cue IDs, timestamps, and HTML tags', () => {
    const mockVtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
<b>Welcome</b> to our broadcast.

2
00:00:03.500 --> 00:00:06.000
We are glad you joined us!

3
00:00:06.500 --> 00:00:09.000
Enjoy the program.
`;

    const text = parseVttToText(mockVtt);
    expect(text).not.toContain('WEBVTT');
    expect(text).not.toContain('00:00:01.000');
    expect(text).not.toContain('<b>');
    expect(text).toContain('Welcome to our broadcast.');
    expect(text).toContain('We are glad you joined us!');
    expect(text).toContain('Enjoy the program.');
  });

  it('parseVttToText returns empty string for empty input', () => {
    expect(parseVttToText('')).toBe('');
  });

  it('blobUrlManager creates and tracks blob URLs without errors', () => {
    // In node/vitest environment, URL.createObjectURL might be mocked if needed
    if (typeof URL.createObjectURL === 'function') {
      const url = blobUrlManager.create('test text', 'text/plain');
      expect(url).toBeDefined();
      blobUrlManager.revoke(url);
    }
  });

  it('buildChromecastUrl encodes video, title, and subtitles properly', () => {
    const videoUrl = 'https://cdn.jw.org/video.mp4';
    const title = 'Monthly Program';
    const subUrl = 'https://cdn.jw.org/sub.vtt';

    const fullUrl = buildChromecastUrl(videoUrl, title, subUrl);
    expect(fullUrl).toContain('https://chromecast.smplayer.info/index.php');
    expect(fullUrl).toContain('&url=');
    expect(fullUrl).toContain('&title=');
    expect(fullUrl).toContain('&subtitles=');

    // Without subtitles
    const noSubUrl = buildChromecastUrl(videoUrl, title);
    expect(noSubUrl).not.toContain('&subtitles=');

    // Empty video URL
    expect(buildChromecastUrl('')).toBe('');
  });

  it('safeBase64Encode encodes UTF-8 text reliably', () => {
    const encoded = safeBase64Encode('JW Cast - Vidéo Français');
    expect(encoded).toBeDefined();
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('fetchChromecastUrl resolves video media items and subtitles correctly', async () => {
    const mockVideo = {
      lank: 'pub-test-video',
      title: 'Test Program',
      description: 'Test desc',
      images: { lsr: { lg: 'https://cdn/img.jpg' } }
    };

    vi.spyOn(mediatorService, 'fetchMediaItem')
      .mockImplementation(async (_lank, langCode) => {
        if (langCode === 'F') {
          return {
            subtitles: [{ file: { url: 'https://cdn/test-sub.vtt' } }]
          };
        }
        return {
          files: [
            { label: '720p', progressiveDownloadURL: 'https://cdn/test-720p.mp4' }
          ]
        };
      });

    const url = await fetchChromecastUrl(mockVideo, 'E', 'F');
    expect(url).toContain('https://chromecast.smplayer.info/index.php');
    expect(url).toContain('&url=');
    expect(url).toContain('&title=');
    expect(url).toContain('&subtitles=');
  });

  it('fetchChromecastUrl returns empty string when video is invalid or has no files', async () => {
    const emptyUrl = await fetchChromecastUrl({ lank: '', title: '', description: '', images: { lsr: { lg: '' } } });
    expect(emptyUrl).toBe('');

    vi.spyOn(mediatorService, 'fetchMediaItem').mockResolvedValueOnce({ files: [] });
    const noFilesUrl = await fetchChromecastUrl({ lank: 'pub-empty', title: 'Empty', description: '', images: { lsr: { lg: '' } } });
    expect(noFilesUrl).toBe('');
  });
});

