export interface Language {
  code: string;
  locale: string;
  name: string;
  vernacular: string;
}

export interface Translations {
  hdgVideos?: string;
  lnkSearch?: string;
  lnkHelpView?: string;
  [key: string]: any;
}

export interface Video {
  lank: string;
  title: string;
  description: string;
  images: {
    lsr: { lg: string };
  };
  url?: string;
}

export interface SearchResponse {
  messages: any[];
  pagination: { label: string };
  sorts: { link: string; label: string }[];
  results: Result[];
}

export interface Result {
  lank: string;
  title: string;
  subtype: string;
  image: { url: string };
}
