
// Konfigurasi Environment
const IS_DEV = true;
export const USING_DUMMY_DATA = false;
export const AVG_DURATION_PER_VIDEO = 8; // veo3 generate 8 detik per video

// Lokalisasi Konten
export const TARGET_CONTENT = "indonesia";

// Base URL untuk aset dan API
export const BASE_URL_MABAR = IS_DEV ? "https://pop-os.taileb15cf.ts.net" : "https://mabar.bharatainternasional.com";
export const API_BASE_URL = IS_DEV ? `${BASE_URL_MABAR}/api/v3/ai_studio` : `${BASE_URL_MABAR}/api/v2/ai_studio`;
export const URL_UPLOAD_ASSET = IS_DEV ? `${BASE_URL_MABAR}/proxy/fetch` : `${BASE_URL_MABAR}/proxy/fetch`;

/**
 * KONFIGURASI MODEL REFERENSI (Google GenAI)
 */
export const MODELS = {
  STORYBOARD: 'gemini-3-flash-preview',
  // STORYBOARD: 'gemini-2.5-flash',
  IMAGE: 'gemini-2.5-flash-image',
  // VIDEO: 'veo-3.1-fast-generate-preview',
  VIDEO:  'veo-3.0-fast-generate-001',
};

export const MODEL_VIDEOS = {
  'veo-3.0' : 'veo-3.0-fast-generate-001',
  'veo-3.1' : 'veo-3.1-fast-generate-preview',
}

export const RESOLUTIONS = [
  { value: '720p', label: '720p (HD)' },
  { value: '1080p', label: '1080p (Full HD)' }
];

export const ASPECT_RATIOS = [
  { value: '16:9', label: 'Landscape (16:9)' },
  { value: '9:16', label: 'Portrait (9:16)' },
  { value: '1:1', label: 'Square (1:1)' }
];

export const DEFAULT_MIN_DURATION = 8;
