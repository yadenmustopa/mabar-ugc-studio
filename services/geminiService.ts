
import { GoogleGenAI, Type, Modality } from "@google/genai";
import {ALLOWED_GEMINI_VOICES, MODEL_LISTS, MODEL_VIDEOS, MODELS, TARGET_CONTENT} from "../constants";
import { StoryboardJSON, StoryboardScene, Character, Product } from "../types";
import { getMimeTypeFromBase64, showToast } from "../utils";
import { mabarApi } from "./mabarService";
import {geminiApiService} from "@/services/geminiApiService";

/**
 * INTERNAL UTILS FOR QUOTA & ROTATION
 */
let CACHED_SYSTEM_KEYS: string[] = [];

const isRetryableError = (error: any): boolean => {
    const msg = error.message?.toLowerCase() || "";
    const status = error?.status || error?.response?.status || 0;
    // Tangkap Quota Exceeded (429) dan Not Found (404 / Requested entity not found)
    return (
        msg.includes("quota") ||
        msg.includes("limit") ||
        msg.includes("not found") ||
        msg.includes("requested entity") ||
        status === 429 ||
        status === 404
    );
};

const translateGeminiError = (error: any): string => {
    const message = error.message || "";
    if (message.includes("raiMediaFilteredReasons")) return message;
    if (message.includes("photorealistic children")) return "Kebijakan Keamanan: Tidak diizinkan membuat video anak-anak secara realistis.";
    if (message.includes("Requested entity was not found") || message.includes("404")) return "Project Google Cloud Anda tidak memiliki akses ke model ini.";
    if (message.includes("billing") || message.includes("403")) return "Masalah Penagihan: Periksa status Billing di Console.";
    return message || "Terjadi kesalahan internal pada layanan AI.";
};

/**
 * CORE EXECUTION WRAPPER (FALLBACK & ROTATION)
 */
async function executeWithFallback<T>(
    taskType: keyof typeof MODEL_LISTS,
    runner: (ai: GoogleGenAI, model: string, apiKey: string) => Promise<T>,
    forcedKey?: string
): Promise<T> {
    // 1. Refresh Key Pool
    if (CACHED_SYSTEM_KEYS.length === 0) {
        try {
            const remoteKeys = await mabarApi.getApiKeys();
            CACHED_SYSTEM_KEYS = remoteKeys.map(k => k.key_value).filter((v): v is string => !!v);
        } catch (e) {
            console.warn("[GeminiService] Gagal memuat kunci sistem.");
        }
    }

    const keyPool = Array.from(new Set([
        forcedKey,
        localStorage.getItem('api_key'),
        process.env.API_KEY,
        ...CACHED_SYSTEM_KEYS
    ])).filter(Boolean) as string[];

    const modelList = MODEL_LISTS[taskType];

    // 3. Execution Pipeline
    for (let kIdx = 0; kIdx < keyPool.length; kIdx++) {
        const currentKey = keyPool[kIdx];
        const ai = new GoogleGenAI({ apiKey: currentKey });

        for (let mIdx = 0; mIdx < modelList.length; mIdx++) {
            const currentModel = modelList[mIdx];

            try {
                console.log(`[GeminiService] Executing ${taskType} | Key #${kIdx + 1} | Model: ${currentModel}`);
                return await runner(ai, currentModel, currentKey);
            } catch (error: any) {
                // if (isRetryableError(error)) {
                console.warn(`[Pipeline Fallback] Model ${currentModel} failed (Error: ${error.message}). Trying alternative...`);

                if (modelList[mIdx + 1]) {
                    continue; // Coba model berikutnya di key yang sama
                } else if (keyPool[kIdx + 1]) {
                    break; // Habis model di key ini, ganti API Key
                }
                // }
                // Jika bukan retryable error (seperti auth error berat), lempar keluar

                throw error;
            }
        }
    }

    throw new Error(`Resource Exhausted: Semua model ${taskType} gagal diproses atau mencapai batas kuota.`);
}

function normalizeVoiceName(v?: string) {
    return v && ALLOWED_GEMINI_VOICES.has(v) ? v : "kore";
}

export const aiService = {
    /**
     * Storyboard Generation dengan Fallback Model
     */
    async generateStoryboardChunk(data: any, existing_scenes: StoryboardScene[] = [], retryCount = 0): Promise<StoryboardJSON> {
        const MAX_RETRIES = 3;
        return executeWithFallback('STORYBOARD', async (ai, model) => {
            const context_scenes = existing_scenes.length > 0
                ? `Lanjutkan cerita secara logis dari adegan terakhir. Total adegan sebelumnya: ${existing_scenes.length}.`
                : "Ini adalah awal video.";

            const prompt = `Bertindaklah sebagai sutradara iklan kelas dunia. Buat storyboard video UGC (User Generated Content) premium.
    
            TARGET AUDIENCE & LANGUAGE: ${TARGET_CONTENT.toUpperCase()} (Wajib menggunakan Bahasa Indonesia yang natural, kekinian, santai, dan relatable).
            
            ATURAN KETAT:
            1. Jaga deskripsi tetap singkat dan bermakna. 
            2. Hindari pengulangan kata yang tidak perlu (REPETITION). 
            3. Fokus pada penceritaan yang emosional namun informatif tentang produk.
            4. Hindari ada karakter anak-anak secara langsung
            
            PRODUK: ${data.product.name}
            DESKRIPSI PRODUK: ${data.product.description}
            KARAKTER: ${data.characters.map((c: any) => `${c.name} (${c.gender}) - ${c.description}`).join(", ")}
            ARAHAN: ${data.user_prompt}
            NEGATIVE PROMPT: ${data.negative_prompt}
            
            ${context_scenes}
        
            Rencanakan adegan sinematik yang menonjolkan manfaat produk dengan gaya penceritaan orang Indonesia. Pastikan karakter konsisten.`;

            try {
                const response = await ai.models.generateContent({
                    model: MODELS.STORYBOARD,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.7,
                        topP: 0.9,
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                description: { type: Type.STRING },
                                production_notes: { type: Type.STRING },
                                products: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            name: { type: Type.STRING },
                                            brand: { type: Type.STRING },
                                            label: { type: Type.STRING },
                                            description: { type: Type.STRING }
                                        },
                                        required: ["name", "description"]
                                    }
                                },
                                scenes: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            scene_number: { type: Type.INTEGER },
                                            duration: { type: Type.NUMBER },
                                            veo_visual_prompt: {
                                                type: Type.STRING,
                                                description: "Gabungkan setting, lighting, dan motion menjadi 1 kalimat deskriptif dalam Bahasa Inggris untuk AI Video."
                                            },
                                            style: { type: Type.STRING },
                                            setting: { type: Type.STRING },
                                            characters: {
                                                type: Type.ARRAY,
                                                items: {
                                                    type: Type.OBJECT,
                                                    properties: {
                                                        name: { type: Type.STRING },
                                                        description: { type: Type.STRING }
                                                    }
                                                }
                                            },
                                            actions: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            camera: { type: Type.STRING },
                                            environment: { type: Type.STRING },
                                            camera_movements: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            camera_angles: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            lighting: { type: Type.STRING },
                                            elements: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    props: { type: Type.ARRAY, items: { type: Type.STRING } },
                                                    textures: { type: Type.ARRAY, items: { type: Type.STRING } },
                                                    colors: { type: Type.ARRAY, items: { type: Type.STRING } }
                                                }
                                            },
                                            motion: { type: Type.STRING },
                                            ending: { type: Type.STRING },
                                            text: { type: Type.STRING },
                                            keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        },
                                        required: ["scene_number", "duration", "veo_visual_prompt", "actions", "setting", "elements"]
                                    }
                                },
                                metadata_content: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        keyword: { type: Type.STRING }
                                    }
                                }
                            },
                            required: ["description", "scenes", "products", "metadata_content"]
                        }
                    },
                });

                let jsonStr = (response.text || "{}").trim();
                if (jsonStr.startsWith("```")) {
                    jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
                }

                try {
                    const parsed = JSON.parse(jsonStr);
                    return parsed as StoryboardJSON;
                } catch (parseError: any) {
                    if (retryCount < MAX_RETRIES) {
                        return await aiService.generateStoryboardChunk(data, existing_scenes, retryCount + 1);
                    }
                    throw new Error(`Gagal memproses struktur storyboard: ${parseError.message}`);
                }
            } catch (e: any) {
                throw new Error(translateGeminiError(e));
            }
        });
    },

    /**
     * Generate Lanjutan Storyboard Berdasarkan Frame Terakhir
     */
    async generateNextStoryboardFromLastFrame(
        data: any,
        last_image_b64: string,
        last_veo_visual_prompt: string,
        existing_scenes: StoryboardScene[] = [],
        retryCount = 0
    ): Promise<StoryboardJSON> {

        const MAX_RETRIES = 3;

        return executeWithFallback('STORYBOARD', async (ai, model) => {

            const mimeType = getMimeTypeFromBase64(last_image_b64);

            const continuationContext = `
        Frame terakhir video sudah di-generate.

        VISUAL PROMPT TERAKHIR:
        "${last_veo_visual_prompt}"

        Tugasmu:
        1. Analisa gambar terakhir dengan detail (pose karakter, ekspresi, lighting, kamera, environment).
        2. Analisa arah cerita dari veo_visual_prompt terakhir.
        3. Buat kelanjutan adegan yang logis, sinematik, dan emosional.
        4. Jangan mengulang adegan sebelumnya.
        5. Pastikan transisi natural.
        `;

            const prompt = `
        Bertindaklah sebagai sutradara iklan kelas dunia.
        Buat lanjutan storyboard video UGC premium.

        TARGET AUDIENCE & LANGUAGE:
        ${TARGET_CONTENT.toUpperCase()} (Bahasa Indonesia natural, kekinian, santai).

        ATURAN KETAT:
        1. Jaga deskripsi singkat & bermakna.
        2. Hindari repetition.
        3. Fokus storytelling emosional & informatif.
        4. Hindari karakter anak-anak.

        PRODUK: ${data.product.name}
        DESKRIPSI PRODUK: ${data.product.description}
        KARAKTER: ${data.characters.map((c: any) => `${c.name} (${c.gender}) - ${c.description}`).join(", ")}

        ${continuationContext}

        Buat adegan lanjutan yang terasa seamless dari frame terakhir.
        `;

            try {

                const response = await ai.models.generateContent({
                    model: model,
                    contents: [
                        {
                            role: "user",
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: mimeType,
                                        data: last_image_b64.replace(/^data:.*;base64,/, '')
                                    }
                                }
                            ]
                        }
                    ],
                    config: {
                        responseMimeType: "application/json",
                        temperature: 0.7,
                        topP: 0.9,
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                description: { type: Type.STRING },
                                production_notes: { type: Type.STRING },
                                products: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            name: { type: Type.STRING },
                                            brand: { type: Type.STRING },
                                            label: { type: Type.STRING },
                                            description: { type: Type.STRING }
                                        },
                                        required: ["name", "description"]
                                    }
                                },
                                scenes: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            scene_number: { type: Type.INTEGER },
                                            duration: { type: Type.NUMBER },
                                            veo_visual_prompt: { type: Type.STRING },
                                            style: { type: Type.STRING },
                                            setting: { type: Type.STRING },
                                            characters: {
                                                type: Type.ARRAY,
                                                items: {
                                                    type: Type.OBJECT,
                                                    properties: {
                                                        name: { type: Type.STRING },
                                                        description: { type: Type.STRING }
                                                    }
                                                }
                                            },
                                            actions: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            camera: { type: Type.STRING },
                                            environment: { type: Type.STRING },
                                            camera_movements: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            camera_angles: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            lighting: { type: Type.STRING },
                                            elements: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    props: { type: Type.ARRAY, items: { type: Type.STRING } },
                                                    textures: { type: Type.ARRAY, items: { type: Type.STRING } },
                                                    colors: { type: Type.ARRAY, items: { type: Type.STRING } }
                                                }
                                            },
                                            motion: { type: Type.STRING },
                                            ending: { type: Type.STRING },
                                            text: { type: Type.STRING },
                                            keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        },
                                        required: ["scene_number", "duration", "veo_visual_prompt", "actions", "setting", "elements"]
                                    }
                                },
                                metadata_content: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        description: { type: Type.STRING },
                                        keyword: { type: Type.STRING }
                                    }
                                }
                            },
                            required: ["description", "scenes", "products", "metadata_content"]
                        }
                    }
                });

                let jsonStr = (response.text || "{}").trim();

                if (jsonStr.startsWith("```")) {
                    jsonStr = jsonStr
                        .replace(/^```json\n?/, "")
                        .replace(/\n?```$/, "")
                        .trim();
                }

                try {
                    const parsed = JSON.parse(jsonStr);
                    return parsed as StoryboardJSON;
                } catch (parseError: any) {
                    if (retryCount < MAX_RETRIES) {
                        return await this.generateNextStoryboardFromLastFrame(
                            data,
                            last_image_b64,
                            last_veo_visual_prompt,
                            existing_scenes,
                            retryCount + 1
                        );
                    }
                    throw new Error(`Gagal memproses struktur storyboard: ${parseError.message}`);
                }

            } catch (e: any) {
                throw new Error(translateGeminiError(e));
            }
        });
    },


    /**
     * Product Identity Locking (Vision -> Image)
     */
    async generateLockedProductImage(product_b64: string, aspect_ratio: string): Promise<string> {
        return executeWithFallback('IMAGE', async (ai, model) => {
            const mime = getMimeTypeFromBase64(product_b64);
            const prompt = `PRODUCT PACKSHOT: Professional studio lighting. 8k photorealistic. Solid color background. Maintain exact branding of @image1.`;

            const response = await ai.models.generateContent({
                model: model,
                contents: {
                    parts: [
                        { inlineData: { data: product_b64.split(',')[1] || product_b64, mimeType: mime } },
                        { text: prompt }
                    ]
                },
                config: { imageConfig: { aspectRatio: aspect_ratio as any } }
            });

            const img = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
            if (!img) throw new Error("Gagal menghasilkan gambar produk terkunci.");
            return img;
        });
    },



    /**
     * Scene Synthesis (Multi-Image Context)
     */
    async generateFirstSceneImage(
        api_key: string,
        prompt_visual: string,
        additional_prompt: string,
        storyboard_chunk: StoryboardJSON,
        locked_product_b64: string,
        characters: Array<Character & { b64: string }>,
        aspect_ratio: string
    ) {
        return executeWithFallback('IMAGE', async (ai, model) => {
            const prodMime = getMimeTypeFromBase64(locked_product_b64);

            // change to lowercase for easier replacement
            prompt_visual = prompt_visual.toLowerCase();
            additional_prompt = additional_prompt.toLowerCase();

            // replace additional_prompt and promptal for words product to @image1(product image), characters to @image2, @image3, ...
            additional_prompt = additional_prompt.replaceAll('product', '@image1 as product image');
            characters.forEach((c, i) => {
                additional_prompt = additional_prompt.replaceAll(c.name, `@image${i + 2} as ${c.name}`);
            });

            prompt_visual = prompt_visual.replaceAll('product', '@image1');
            characters.forEach((c, i) => {
                prompt_visual = prompt_visual.replaceAll(c.name, `@image${i + 2}`);
            });

            additional_prompt = additional_prompt.replaceAll('karakter', characters.map((c, i) => `@image${i + 2} as ${c.name}`).join(", "));
            prompt_visual = prompt_visual.replaceAll('karakter', characters.map((c, i) => `@image${i + 2} as ${c.name}`).join(", "));


            const prompt_text = `
          [[Rules]]
          - @image1: Product image to keep consistent, exact branding, colors, and shape (Lock original image).
          - ${characters.map((c, i) => `@image${i+2}: Character image  (${c.name}) to keep consistent, Lock the face`).join("\n- ")}
         
          [[Todo]]
          - I will generate image From Combine image @image1 with image characters: ${characters.map((c, i) => `@image${i+2}`).join(", ") } with style cimenatic ugc production Scene: ${prompt_visual}. ${additional_prompt}
          
          [[output]]
          Style: High-end advertising photography,  Natural lighting from [direction and quality], showing realistic subsurface scattering on the skin. [Specific expression] with micro-expressions visible. Shot at golden hour with soft natural shadows. 8K resolution, unretouched photography style
      `;

            const parts: any[] = [{ inlineData: { data: locked_product_b64.split(',')[1] || locked_product_b64, mimeType: prodMime } }];

            characters.forEach(c => {
                parts.push({ inlineData: { data: c.b64.split(',')[1] || c.b64, mimeType: getMimeTypeFromBase64(c.b64) } });
            });

            parts.push({ text: prompt_text });

            const response = await ai.models.generateContent({
                model: model,
                contents: { parts },
                config: { imageConfig: { aspectRatio: aspect_ratio as any } }
            });

            const base64 = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
            if (!base64) throw new Error("Sintesis adegan gagal.");
            return base64;
        }, api_key);
    },

    /**
     * Generate Next Scene Image (Continuity Mode)
     */
    async generateNextSceneImage(
        api_key: string,
        prompt_visual: string,
        additional_prompt: string,
        storyboard_chunk: StoryboardJSON,
        last_scene_b64: string,
        characters: Array<Character & { b64?: string }>,
        aspect_ratio: string
    ) {
        return executeWithFallback('IMAGE', async (ai, model) => {

            const lastMime = getMimeTypeFromBase64(last_scene_b64);

            prompt_visual = prompt_visual.toLowerCase();
            additional_prompt = additional_prompt.toLowerCase();

            // Replace character names with image references
            characters.forEach((c, i) => {
                prompt_visual = prompt_visual.replaceAll(c.name.toLowerCase(), `@image${i + 2}`);
                additional_prompt = additional_prompt.replaceAll(c.name.toLowerCase(), `@image${i + 2} as ${c.name}`);
            });

            additional_prompt = additional_prompt.replaceAll(
                'karakter',
                characters.map((c, i) => `@image${i + 2} as ${c.name}`).join(", ")
            );

            prompt_visual = prompt_visual.replaceAll(
                'karakter',
                characters.map((c, i) => `@image${i + 2}`).join(", ")
            );

            const prompt_text = `
        [[Previous Scene Reference]]
        - @image1: Last generated scene. Maintain visual continuity including lighting direction, camera angle, environment mood, and character positioning.

        [[Characters]]
        - ${characters.map((c, i) =>
                `@image${i+2}: Character (${c.name}) – Keep face identity, hairstyle, outfit consistent`
            ).join("\n- ")}

        [[CINEMATIC UGC CONTINUATION]]
        - Continue from previous frame naturally.
        - Scene: ${prompt_visual}. ${additional_prompt}.
        - Maintain cinematic flow, realistic motion transition.
        - Preserve spatial relationship between characters.
        - Keep emotional tone consistent.

        [[Visual Style]]
        - High-end advertising photography
        - Natural realistic lighting
        - Soft shadows
        - 8K ultra detailed
        - Realistic skin texture, micro-expression
        - No distortion
        - Motion should feel like continuation of a video cut, not a new photoshoot.
        - Slight natural body progression from previous pose.


        [[Rules]]
        - Use @image1 as base continuity reference.
        - Do NOT drastically change camera perspective unless motivated.
        - Avoid sudden lighting change.
        - Avoid changing character facial structure.
        `;

            const parts: any[] = [
                {
                    inlineData: {
                        data: last_scene_b64.split(',')[1] || last_scene_b64,
                        mimeType: lastMime
                    }
                }
            ];

            // Add character reference images if available
            characters.forEach((c, i) => {
                if (c.b64) {
                    parts.push({
                        inlineData: {
                            data: c.b64.split(',')[1] || c.b64,
                            mimeType: getMimeTypeFromBase64(c.b64)
                        }
                    });
                }
            });

            parts.push({ text: prompt_text });

            const response = await ai.models.generateContent({
                model: model,
                contents: { parts },
                config: {
                    imageConfig: {
                        aspectRatio: aspect_ratio as any
                    }
                }
            });

            const base64 =
                response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;

            if (!base64) throw new Error("Next scene synthesis gagal.");

            return base64;

        }, api_key);
    },


    /**
     * Analyze Image for Video Prompting (Helper: analyzeScene)
     */
    async analyzeFirstSceneImage(image_b64: string, prompt: string, characters: Character[], product: Product): Promise<any> {
        return executeWithFallback('VISION', async (ai, model) => {
            const mime = getMimeTypeFromBase64(image_b64);
            const clean_b64 = image_b64.includes(',') ? image_b64.split(',')[1] : image_b64;

            const parts = [
                { inlineData: { data: clean_b64, mimeType: mime } },
                { text: `Analyze this image for high-end cinematic video generation. 
          Product to maintain: ${product.name}. 
          Characters to maintain: ${characters.map(c => c.name).join(", ")}. 
          Target Scenario: ${prompt}. 
          Task: Create an extremely detailed descriptive prompt that represents the EXACT visuals and actions of this frame as a starting point for a text-to-video model.
          Return JSON format with key 'description_first_image'.` }
            ];

            const response = await ai.models.generateContent({
                model: model,
                contents: { parts },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: { description_first_image: { type: Type.STRING } },
                        required: ["description_first_image"]
                    }
                }
            });
            return JSON.parse(response.text || "{}");
        });
    },

    /**
     * Refine description for Veo Analysis (Helper: analyzeSceneForVeo)
     */
    async analyzeSceneForVeo(image_b64: string, description: string): Promise<string> {
        return executeWithFallback('VISION', async (ai, model) => {
            const mime = getMimeTypeFromBase64(image_b64);
            const clean_b64 = image_b64.includes(',') ? image_b64.split(',')[1] : image_b64;

            const parts = [
                { inlineData: { data: clean_b64, mimeType: mime } },
                { text: `Optimize this description for cinematic video generation: ${description}. 
          Instructions: Describe every camera movement, subject action, lighting change, and textural detail present in the frame to ensure a Text-to-Video model can replicate the consistency. Focus on realistic photorealistic movement.` }
            ];
            const response = await ai.models.generateContent({ model: model, contents: { parts } });
            return response.text || description;
        });
    },

    /**
     * Video Generation (Veo 3.1) with legacy 3.0 detection
     */
    async generateVideoVeo31(
        api_key: string,
        image_base64: string,
        prompt_text: string,
        aspect_ratio: string,
        characters: Character[] = [],
        resolution = "720p",
        storyboard?: StoryboardJSON
    ) {
        // try{
        //     console.log("[GenerateVideoVeo31] Starting video generation with Veo 3.1 flow. with api_key: ", api_key);
        //     return executeWithFallback('VIDEO', async (ai, model, apiKey) => {
        //         const mime = getMimeTypeFromBase64(image_base64);
        //         const clean_base64 = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;
        //
        //         const final_prompt = `
        //     NARRATIVE: ${storyboard?.description || prompt_text}
        //     SCENE: ${prompt_text}
        //     [LOCKED] Keep product branding and characters 100% consistent with seed frame.
        //     [AUDIO] Natural Indonesian dialogue for ${characters.map(c => c.name).join(", ")}.`;
        //
        //         let operation;
        //
        //         // KONDISI KHUSUS: Jika model yang terpilih adalah seri 3.0 (Legacy)
        //         // Gunakan alur: Analyze Scene -> Analyze Scene For Veo -> Text-To-Video murni.
        //         // if (model.includes('veo-3.0')) {
        //         //     console.warn(`[GeminiService] Legacy model detected (${model}). Switching to analyze-then-text flow.`);
        //         //
        //         //     const sceneAnalysis = await this.analyzeFirstSceneImage(image_base64, final_prompt, characters, { name: "Target Product" } as Product);
        //         //     const refinedPrompt = await this.analyzeSceneForVeo(image_base64, sceneAnalysis.description_first_image);
        //         //
        //         //     operation = await ai.models.generateVideos({
        //         //         model: model,
        //         //         prompt: `VISUAL SCENE: ${refinedPrompt}. ACTION: ${final_prompt}. High-end photorealistic cinematic movement.`,
        //         //         config: { numberOfVideos: 1, resolution: "720p", aspectRatio: aspect_ratio as any }
        //         //     });
        //         // } else {
        //             // Alur Standar Veo 3.1 (Image-To-Video)
        //             operation = await ai.models.generateVideos({
        //                 model: model,
        //                 prompt: final_prompt,
        //                 image: { imageBytes: clean_base64, mimeType: mime },
        //                 config: { numberOfVideos: 1, resolution: resolution, aspectRatio: aspect_ratio as any }
        //             });
        //         // }
        //
        //         while (!operation.done) {
        //             await new Promise(r => setTimeout(r, 10000));
        //             operation = await ai.operations.getVideosOperation({ operation });
        //         }
        //
        //         console.log("[GenerateVideoVeo31] Video generation operation completed: ", operation);
        //
        //         const rai = (operation.response as any)?.raiMediaFilteredReasons;
        //         if (rai && rai.length > 0) throw new Error(`Keamanan Konten: ${rai.join(". ")}`);
        //
        //         const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
        //         if (!uri) throw new Error("Gagal mendapatkan URI video.");
        //
        //         const res = await fetch(`${uri}&key=${apiKey}`);
        //
        //         if (!res.ok) {
        //             throw new Error("Gagal mengunduh video dari server Google.")
        //         }
        //         return await res.blob();
        //     }, api_key);
        // }catch (e) {
        //     console.error("[GeminiService] Gagal menghasilkan video dengan GeminiService, mencoba fallback ke GeminiApiService...", e);
        console.log("[generateVideoVeo31] Gagal menghasilkan video dengan GeminiService, mencoba fallback ke GeminiApiService... With Parameters: ", {
            image_base64,
            prompt_text,
            aspect_ratio,
            characters,
            resolution,
            storyboard,
            api_key
        });
        if(api_key){
            console.log("[GeminiService] Mencoba fallback ke GeminiApiService untuk unduhan video dengan API Key khusus : ", api_key);
            return await geminiApiService.generateImageToVideo(
                api_key,
                image_base64,
                prompt_text,
                aspect_ratio,
                characters,
                resolution,
                storyboard
            )
        }
        // }

        throw new Error("Gagal menghasilkan video dengan GeminiService dan GeminiApiService.");

    },

    /**
     * Image to Video (Fast Preview) with legacy detection
     */
    async generateVideoVeo30FastPreviewImageToVideo(image_base64: string, prompt_text: string, aspect_ratio: string): Promise<Blob> {
        return executeWithFallback('VIDEO', async (ai, model, apiKey) => {
            const fastModel = model;

            if (fastModel.includes('veo-3.0')) {
                const initialAnalysis = await this.analyzeFirstSceneImage(image_base64, prompt_text, [], { name: "Product" } as Product);
                const refinedPrompt = await this.analyzeSceneForVeo(image_base64, initialAnalysis.description_first_image);

                let op = await ai.models.generateVideos({
                    model: fastModel,
                    prompt: `SCENE DESCRIPTION: ${refinedPrompt}. USER BRIEF: ${prompt_text}. Create a photorealistic, cinematic movement.`,
                    config: { numberOfVideos: 1, resolution: "720p", aspectRatio: aspect_ratio as any }
                });

                while (!op.done) {
                    await new Promise(r => setTimeout(r, 8000));
                    op = await ai.operations.getVideosOperation({ operation: op });
                }

                const res = await fetch(`${op.response?.generatedVideos?.[0]?.video?.uri}&key=${apiKey}`);
                return await res.blob();
            } else {
                const mime = getMimeTypeFromBase64(image_base64);
                let op = await ai.models.generateVideos({
                    model: fastModel,
                    prompt: prompt_text,
                    image: { imageBytes: image_base64.split(',')[1] || image_base64, mimeType: mime },
                    config: { numberOfVideos: 1, resolution: "720p", aspectRatio: aspect_ratio as any }
                });

                while (!op.done) {
                    await new Promise(r => setTimeout(r, 8000));
                    op = await ai.operations.getVideosOperation({ operation: op });
                }

                const res = await fetch(`${op.response?.generatedVideos?.[0]?.video?.uri}&key=${apiKey}`);
                return await res.blob();
            }
        });
    },

    /**
     * Video Fallback for Veo 3.0
     */
    async generateVideoVeo30WithAudio(veoAnalysis: string, json_describe: any, aspect_ratio: string): Promise<Blob> {
        return executeWithFallback('VIDEO', async (ai, model, apiKey) => {
            const fastModel = model;
            let op = await ai.models.generateVideos({
                model: fastModel,
                prompt: veoAnalysis,
                config: { numberOfVideos: 1, resolution: "720p", aspectRatio: aspect_ratio as any }
            });
            while (!op.done) {
                await new Promise(r => setTimeout(r, 10000));
                op = await ai.operations.getVideosOperation({ operation: op });
            }
            const res = await fetch(`${op.response?.generatedVideos?.[0]?.video?.uri}&key=${apiKey}`);
            return await res.blob();
        });
    }
};
