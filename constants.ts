
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
 * MODEL HIERARCHY (Priority Based)
 * Note: veo-3.0-fast-generate-001 sering menyebabkan error 404 karena identifier khusus Vertex AI.
 */
export const MODEL_LISTS = {
  STORYBOARD: [
    'gemini-3-flash-preview',        // Priority 1: Smartest & Latest
    'gemini-2.5-flash-lite-latest',  // Priority 2: Fast & High Quota
    'gemini-2.0-flash'               // Priority 3: Stable
  ],
  IMAGE: [
    'gemini-2.5-flash-image'         // Dedicated Image Gen
  ],
  VISION: [
    'gemini-3-flash-preview',        // Multi-modal support for analysis
    'gemini-2.0-flash'
  ],
  VIDEO: [
    'veo-3.1-fast-generate-preview', // Pro/New
    'veo-3.1-generate-preview',      // High Quality
  ]
};

export const MODELS = {
  STORYBOARD: MODEL_LISTS.STORYBOARD[0],
  IMAGE: MODEL_LISTS.IMAGE[0],
  VIDEO: MODEL_LISTS.VIDEO[0],
  VISION: MODEL_LISTS.VISION[0]
};

export const MODEL_VIDEOS = {
  'veo-3.0' : 'veo-3.0-fast-generate-preview',
  'veo-3.0-preview' : 'veo-3.0-fast-generate-preview',
  'veo-3.1' : 'veo-3.1-fast-generate-preview',
  'veo-3.1-preview' : 'veo-3.1-generate-preview'
}

export const PROJECT_ID = "ceremonial-rush-462106-a7";
export const using_vertex = true;

export const ALLOWED_GEMINI_VOICES = new Set([
  "achernar","aoede","autonoe","callirrhoe","despina","erinome",
  "gacrux","kore","laomedeia","leda","pulcherrima","sulafat",
  "vindemiatrix","zephyr",
  "achird","algenib","algieba","alnilam","charon","enceladus",
  "fenrir","iapetus","orus","puck","rasalgethi","sadachbia",
  "sadaltager","schedar","umbriel","zubenelgenubi"
]);

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
