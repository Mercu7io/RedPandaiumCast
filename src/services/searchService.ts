import axios from 'axios';
import { SearchResponse } from '@/types';

export interface ParsedJwUrl {
  langCode?: string;
  locale?: string;
  lank?: string;
  category?: string;
}

export function parseDirectJwUrl(input: string): ParsedJwUrl | null {
  if (!input) return null;

  const finderRegex = /jw\.org\/finder\?.+&.+/;
  const wtLocaleRegex = /wtlocale=(?<code>[A-Za-z]+)/;
  const localeRegex = /locale=(?<locale>[A-Za-z]+)/;
  const lankRegex = /lank=(?<lank>[\w-]+)/;
  const mediaItemsRegex = /jw\.org\/[\w-]+\/.+#(?<locale>[\w-]+)\/mediaitems\/(?<category>[\w-]+)\/(?<lank>[\w-]+)/;

  if (finderRegex.test(input)) {
    const langCode = wtLocaleRegex.exec(input)?.groups?.code;
    const locale = localeRegex.exec(input)?.groups?.locale;
    const lank = lankRegex.exec(input)?.groups?.lank;
    return { langCode, locale, lank };
  }

  if (mediaItemsRegex.test(input)) {
    const match = mediaItemsRegex.exec(input);
    const locale = match?.groups?.locale;
    const lank = match?.groups?.lank;
    const category = match?.groups?.category;
    return { locale, lank, category };
  }

  return null;
}

export const searchService = {
  async fetchToken(): Promise<string> {
    const res = await axios.get('https://b.jw-cdn.org/tokens/jworg.jwt');
    return res.data;
  },

  async searchVideos(
    query: string,
    langCode: string = 'E',
    sort: string = 'rel',
    jwt: string
  ): Promise<SearchResponse> {
    const searchApiBaseUrl = 'https://b.jw-cdn.org/apis/search/results';
    const url = `${searchApiBaseUrl}/${langCode}/videos?sort=${sort}&q=${encodeURIComponent(query)}`;

    const config = {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    };

    const res = await axios.get<SearchResponse>(url, config);
    if (res.data && res.data.results) {
      res.data.results = res.data.results.filter((r) => r.subtype !== 'videoCategory');
    }
    return res.data;
  },

  parseDirectJwUrl,
};
