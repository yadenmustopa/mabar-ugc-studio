
import axios from 'axios';
import { API_BASE_URL, USING_DUMMY_DATA } from '../constants';
import { Product, Character, ObjectStorage, TaskStatus, User, ApiKey } from '../types';

const getHeaders = () => {
    const token = localStorage.getItem('token-mabar');
    return {
        'Content-Type': 'application/json',
        'token-mabar': token || ''
    };
};

export const mabarApi = {
    checkAuth: async (): Promise<User> => {
        if (USING_DUMMY_DATA) return Promise.resolve({ id: 99, name: "Expert User", email: "user@mabar.ai", role: "Senior" } as User);
        const response = await axios.get(`${API_BASE_URL}/whoami`, { headers: getHeaders() });
        return response.data.whoami;
    },

    getApiKeys: async (): Promise<ApiKey[]> => {
        if (USING_DUMMY_DATA) return [];
        const response = await axios.get(`${API_BASE_URL}/api_keys`, { headers: getHeaders() });
        return response.data.api_keys;
    },

    generateApiKey: async (payload: any): Promise<ApiKey> => {
        if (USING_DUMMY_DATA) {
            console.log("[MabarApi] Simulasi pendaftaran dengan payload:", payload);
            await new Promise(r => setTimeout(r, 3000));
            return {
                id: Date.now(),
                label: payload.project_name,
                key_prefix: "AIzaDummy_RealMode_Off",
                is_active: true
            };
        }

        const response = await axios.post(`${API_BASE_URL}/api_keys/generate`, payload, {
            headers: getHeaders()
        });
        return response.data.api_key;
    },

    getProducts: async (): Promise<Product[]> => {
        const response = await axios.get(`${API_BASE_URL}/products`, { headers: getHeaders() });
        return response.data.products;
    },

    getCharacters: async (): Promise<Character[]> => {
        const response = await axios.get(`${API_BASE_URL}/characters`, { headers: getHeaders() });
        return response.data.characters;
    },

    // getApiKeys: async (): Promise<Character[]> => {
    //     const response = await axios.get(`${API_BASE_URL}/characters`, { headers: getHeaders() });
    //     return response.data.characters;
    // },

    getObjectStorages: async (): Promise<ObjectStorage[]> => {
        const response = await axios.get(`${API_BASE_URL}/object_storages`, { headers: getHeaders() });
        return response.data.object_storages;
    },

    initUGC: async (payload: any) => {
        const response = await axios.post(`${API_BASE_URL}/ugc`, payload, { headers: getHeaders() });
        return response.data.ugc;
    },

    setStoryboard: async (ugcId: string | number, itemId: string | number, storyboard: any[]) => {
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/story_board`, { storyboard }, { headers: getHeaders() });
    },

    setAnalyzeScene: async (ugcId: string | number, itemId: string | number, analyze_scene_json: string) => {
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/set_analyze_scene`, { analyze_scene_json }, { headers: getHeaders() });
    },

    setFirstSceneImage: async (ugcId: string | number, itemId: string | number, imageBlob: Blob, imageIndex: number) => {
        const formData = new FormData();
        formData.append('image_index', imageIndex.toString());
        formData.append('file', imageBlob, `scene_${imageIndex}.png`);
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/scene_image_first`, formData, {
            headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' }
        });
    },

    setVideoFileItem: async (ugcId: string | number, itemId: string | number, videoBlob: Blob, videoIndex: number) => {
        const formData = new FormData();
        formData.append('file', videoBlob, `item_${itemId}.mp4`);
        formData.append('video_index', videoIndex.toString());

        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/save_video_file`, formData, {
            headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' }
        });
    },

    setVoiceOverFileItem: async (ugcId: string | number, itemId: string | number, voiceOverBlob: Blob, voiceOverIndex: number) => {
        const formData = new FormData();
        formData.append('file', voiceOverBlob, `item_${itemId}.wav`);
        formData.append('voice_over_index', voiceOverIndex.toString());

        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/save_voice_over_file`, formData, {
            headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' }
        });
    },

    setCompleteItem: async (ugcId: string | number, itemId: string | number) => {
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/complete`, {  }, { headers: getHeaders() });
    },

    setStep: async (ugcId: string | number, itemId: string | number, step: TaskStatus) => {
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/step`, { step }, { headers: getHeaders() });
    },

    setFailItem: async (ugcId: string | number, itemId: string | number, reason: string) => {
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/item/${itemId}/fail`, { failed_reason: reason }, { headers: getHeaders() });
    },

    setUgcComplete: async (ugcId: string | number) => {
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/complete`, { headers: getHeaders() });
    },

    setUgcFail: async (ugcId: string | number, reason: string) => {
        return axios.post(`${API_BASE_URL}/ugc/${ugcId}/fail`, { failed_reason: reason }, { headers: getHeaders() });
    }
};
