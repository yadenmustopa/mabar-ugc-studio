
export enum TaskStatus {
  IDLE = 'IDLE',
  INIT_UGC = 'Initiating UGC',
  CREATING_STORYBOARD = 'Creating Storyboard',
  GENERATING_FIRST_SCENE_IMAGE = 'Generating First Scene Image',
  GENERATING_VIDEO = 'Generating Video',
  UPLOADING_S3 = 'Uploading to Vultr S3',
  COMPLETING = 'Completing',
  ANALYZING_SCENE = 'Analyzing Scene',
  GENERATING_VOICEOVER = 'Generating Voiceover',
  COMPLETED = 'Completed',
  FAILED = 'Failed'
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  description: string;
  prompt_description: string;
  dimension: string;
  image_url: string;
  product_reference_image_path?: string | null;
}

export interface Character {
  id: number;
  name: string;
  gender: 'MALE' | 'FEMALE';
  description: string;
  prompt: string;
  image_url?: string;
  character_image_path?: string | null;
}

// Fix: Add label and key_prefix to satisfy API response mapping and dummy data usage
export interface ApiKey {
  id: number;
  key_name?: string;
  key_value?: string;
  label?: string;
  key_prefix?: string;
  is_active: boolean|number;
}

export interface ObjectStorage {
  object_storage_id: number;
  label: string;
  buckets: string;
  s3_hostname: string;
  s3_access_key: string;
  s3_secret_key: string;
}

export interface GenerationItem {
  id: string;
  ugc_id: string;
  order_index: number;
  status: TaskStatus;
  progress: number;
  generate_urls?: Array<string>;
  failed_reason?: string;
  storyboard_data?: [Object];
  local_audio_urls?: Array<{ scene_index: number; url: string }>;
}

export interface GenerationSceneImageItem {
  id: string;
  ugc_id: string;
  order_index: number;
  status: TaskStatus;
  progress: number;
  failed_reason?: string;
  storyboard_data?: [Object];
  base64_scene_images?: string[];
  image_to_video_prompts?: string[];
}

export interface UGC {
  id: number;
  name: string;
  status: string;
  items?: GenerationItem[];
}

export interface StoryboardScene {
  scene_number: number;
  duration: number; // Durasi scene dalam detik
  style: string;
  setting: string;
  characters: Array<{ name: string; description: string }>;
  actions: string[];
  camera: string;
  environment: string;
  camera_movements: string[];
  camera_angles: string[];
  lighting: string;
  elements: { props: string[]; textures: string[]; colors: string[] };
  motion: string;
  ending: string;
  text: string;
  keywords: string[];
}

export interface StoryboardJSON {
  description: string;
  production_notes: string;
  products: Array<{ name: string; brand: string; label: string; description: string }>;
  scenes: StoryboardScene[];
  metadata_content: {
    title: string;
    description: string;
    keyword: string;
  };
}
