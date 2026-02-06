// export const API_BASE_URL = 'https://mabar.bharatainternasional.com/api/v2/ai_studio';
const IS_DEV = true;
export const USING_DUMMY_DATA = false;

export const API_BASE_URL = (IS_DEV) ? "https://3700ac61a925.ngrok-free.app/api/v3/ai_studio" : "https://mabar.bharatainternasional.com/api/v2/ai_studio";

/**
 * KONFIGURASI MODEL REFERENSI (Google GenAI)
 * 
 * Pilihan Model Tersedia:
 * - gemini flash: 'gemini-flash-latest'
 * - gemini lite: 'gemini-flash-lite-latest'
 * - gemini pro: 'gemini-3-pro-preview'
 * - gemini flash image: 'gemini-2.5-flash-image'
 * - gemini pro image: 'gemini-3-pro-image-preview'
 * - gemini flash audio: 'gemini-2.5-flash-native-audio-preview-12-2025'
 * - gemini tts: 'gemini-2.5-flash-preview-tts'
 * - veo (High Quality): 'veo-3.1-generate-preview'
 * - veo fast (Lower Latency): 'veo-3.1-fast-generate-preview'
 */
export const MODELS = {
  STORYBOARD: 'gemini-3-flash-preview',
  IMAGE: 'gemini-2.5-flash-image',
  VIDEO: 'veo-3.1-fast-generate-preview'
};

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