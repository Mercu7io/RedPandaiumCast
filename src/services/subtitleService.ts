import axios from 'axios';
import { Video } from '@/types';
import { mediatorService, DEFAULT_MEDIATOR_URL, extractSubtitleVtt } from './mediatorService';

export interface GenerateSubtitlesParams {
  lank: string;
  targetLang: string;
  sourceLang?: string;
  audioUrl?: string;
  subtitleUrl?: string;
}

export interface SubtitleResponse {
  status: string;
  source: string;
  vttContent: string;
}

export function parseVttToText(vttContent: string): string {
  if (!vttContent) return '';
  const lines = vttContent.split(/\r?\n/);
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:')) {
      i++;
      continue;
    }
    if (line.includes('-->')) {
      i++;
      continue;
    }
    // Lookahead: if the NEXT line is a timestamp, current line is a cue ID
    if (i + 1 < lines.length && lines[i + 1].includes('-->')) {
      i += 2;
      continue;
    }
    if (line !== '') {
      output.push(line.replace(/<[^>]+>/g, ''));
    }
    i++;
  }

  let combined = '';
  for (let j = 0; j < output.length; j++) {
    combined += output[j];
    if (/[.?!;]$/.test(output[j])) {
      combined += '\n\n';
    } else {
      combined += ' ';
    }
  }

  return combined.trim();
}

class BlobUrlManager {
  private activeUrls: Set<string> = new Set();

  create(content: string, mimeType: string): string {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    this.activeUrls.add(url);
    return url;
  }

  revoke(url: string): void {
    if (url && this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
    }
  }

  revokeAll(): void {
    for (const url of this.activeUrls) {
      URL.revokeObjectURL(url);
    }
    this.activeUrls.clear();
  }
}

export const blobUrlManager = new BlobUrlManager();

export function safeBase64Encode(str: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    try {
      return window.btoa(unescape(encodeURIComponent(str)));
    } catch {
      return window.btoa(str);
    }
  }
  return Buffer.from(str, 'utf-8').toString('base64');
}

export function buildChromecastUrl(videoUrl: string, title: string = '', subUrl?: string): string {
  if (!videoUrl) return '';
  const baseUrl = 'https://chromecast.smplayer.info/index.php?sfgc=I2ZmZmZmZg==&ss=MS4x';
  let url = `${baseUrl}&url=${safeBase64Encode(videoUrl)}`;
  if (title) {
    url += `&title=${safeBase64Encode(title)}`;
  }
  if (subUrl) {
    url += `&subtitles=${safeBase64Encode(subUrl)}`;
  }
  return url;
}

export async function fetchChromecastUrl(
  video: Video,
  videoLangCode: string = 'E',
  subLangCode?: string,
  mediatorUrl: string = DEFAULT_MEDIATOR_URL
): Promise<string> {
  if (!video || !video.lank) return '';
  try {
    const requests: Promise<any>[] = [
      mediatorService.fetchMediaItem(video.lank, videoLangCode, mediatorUrl)
    ];
    if (subLangCode && subLangCode !== videoLangCode) {
      requests.push(mediatorService.fetchMediaItem(video.lank, subLangCode, mediatorUrl).catch(() => null));
    }
    const responses = await Promise.all(requests);
    const vNode = responses[0];
    const sNode = responses.length > 1 ? responses[1] : null;

    const files = vNode?.files || [];
    const file =
      files.find((f: any) => f.label === '720p' && f.progressiveDownloadURL) ||
      files.find((f: any) => f.label === '1080p' && f.progressiveDownloadURL) ||
      files.find((f: any) => f.label === '480p' && f.progressiveDownloadURL) ||
      files.find((f: any) => f.progressiveDownloadURL) ||
      files[0];
    const videoUrl = file?.progressiveDownloadURL || '';
    if (!videoUrl) return '';

    let subUrl = sNode ? extractSubtitleVtt(sNode) : '';
    if (!subUrl && vNode) {
      subUrl = extractSubtitleVtt(vNode);
    }
    return buildChromecastUrl(videoUrl, video.title, subUrl || undefined);
  } catch (error) {
    console.error('Failed to get chromecast URL for video:', error);
    return '';
  }
}

export async function openChromecastForVideo(
  video: Video,
  videoLangCode: string = 'E',
  subLangCode?: string,
  mediatorUrl: string = DEFAULT_MEDIATOR_URL,
  preloadedUrl?: string
): Promise<void> {
  if (preloadedUrl) {
    window.open(preloadedUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const targetWindow = window.open('about:blank', '_blank');
  if (targetWindow?.document) {
    try {
      targetWindow.document.title = 'RedPandaium Cast - Connecting...';
    } catch {}
  }

  try {
    const url = await fetchChromecastUrl(video, videoLangCode, subLangCode, mediatorUrl);
    if (url && targetWindow) {
      targetWindow.location.href = url;
    } else if (targetWindow) {
      targetWindow.close();
    }
  } catch (err) {
    console.error('Failed to open chromecast window:', err);
    if (targetWindow) {
      targetWindow.close();
    }
  }
}

export const subtitleService = {
  async generateAiSubtitles(params: GenerateSubtitlesParams): Promise<SubtitleResponse> {
    const response = await axios.post<SubtitleResponse>('/api/subtitles/generate', params);
    return response.data;
  },

  async downloadTextFile(content: string, filename: string): Promise<void> {
    const url = blobUrlManager.create(content, 'text/plain;charset=utf-8');
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => blobUrlManager.revoke(url), 1000);
  },

  parseVttToText,
  blobUrlManager,
  buildChromecastUrl,
  fetchChromecastUrl,
  openChromecastForVideo,
};

