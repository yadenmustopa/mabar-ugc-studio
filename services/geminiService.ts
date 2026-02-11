
import { GoogleGenAI, Type, Modality } from "@google/genai";
import {ALLOWED_GEMINI_VOICES, MODEL_VIDEOS, MODELS, TARGET_CONTENT} from "../constants";
import { StoryboardJSON, StoryboardScene, Character } from "../types";
import {getMimeTypeFromBase64} from "@/utils";

const getEffectiveApiKey = (): string => {
  const env_api_key = process.env.API_KEY || '';
  console.log("env_api_key :", env_api_key);
  return env_api_key;
};

const translateGeminiError = (error: any, step_request=""): string => {
  const message = error.message || "";
  if (message.includes("raiMediaFilteredReasons")) return message;
  if (message.includes("photorealistic children")) return "Kebijakan Keamanan: Tidak diizinkan membuat video anak-anak secara realistis.";
  if (message.includes("Requested entity was not found") || message.includes("404")) return "Project Google Cloud Anda tidak memiliki akses ke model ini.";
  if (message.includes("billing") || message.includes("403")) return "Masalah Penagihan: Periksa status Billing di Console.";
  return "Terjadi kesalahan internal pada layanan AI (Gemini) Pada langkah: " + step_request + ". Dengan pesan: " + message;
};

function normalizeVoiceName(v?: string) {
  return v && ALLOWED_GEMINI_VOICES.has(v) ? v : "kore";
}

export const aiService = {
  /**
   * Menghasilkan potongan storyboard JSON menggunakan Structured Output.
   */
  async generateStoryboardChunk(data: any, existing_scenes: StoryboardScene[] = [], retryCount = 0): Promise<StoryboardJSON> {
    let apiKey = getEffectiveApiKey();
    console.log("[GeminiService] Using API Key Prefix:", apiKey ? apiKey.slice(0, 8) + "..." : "No Key");
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const MAX_RETRIES = 4;

    const lastScenes = existing_scenes.slice(-2);
    const totalScenes = existing_scenes.length;

    console.log({characters_in_storyboard_chunk: data.characters})

    const context_scenes = lastScenes.length > 0
        ? `
CONTEXT KONTINUITAS (Penting untuk visual):
Total adegan yang sudah dibuat: ${totalScenes}.
Adegan Terakhir (Adegan ${totalScenes}):
- Setting: ${lastScenes[lastScenes.length - 1].setting}
- Posisi Karakter: ${lastScenes[lastScenes.length - 1].ending}
- Style Visual: ${lastScenes[lastScenes.length - 1].style}

TUGAS: Lanjutkan ke Adegan ${totalScenes + 1}. Pastikan transisi smooth dari "Posisi Karakter" di atas.`
        : "Mulai video dari Adegan 1.";

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
        if(!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
          throw new Error("Struktur JSON valid tapi adegan kosong. Mungkin model gagal menghasilkan konten yang sesuai. Coba lagi.");
        }

        return parsed as StoryboardJSON;
      } catch (parseError: any) {
        if (retryCount < MAX_RETRIES) {
          return await aiService.generateStoryboardChunk(data, existing_scenes, retryCount + 1);
        }
        throw new Error(`Gagal memproses struktur storyboard: ${parseError.message}`);
      }
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "generateStoryboardChunk"));
    }
  },

  /**
   * PASS 1 — Generate LOCKED product image
   * This image becomes the immutable master asset.
   */
  async generateLockedProductImage(
      product_b64: string,
      aspect_ratio: string,
      using_api_key: boolean = false,
      max_retries = 2
  ): Promise<string> {
    console.log("[GeminiService] Generating Locked Product Image with base64:", product_b64);

    if(!product_b64 || product_b64.length < 100) {
        throw new Error("Invalid product image data for locked image generation.");
    }

    let api_key = getEffectiveApiKey();

    if(using_api_key) {
        api_key = localStorage.getItem('api_key');
    }

    console.log("Current API Key Prefix for Locked Product Image:", api_key ? api_key.slice(0, 8) + "..." : "No Key");

    let param_key = {
        apiKey : api_key
    }

    const ai = new GoogleGenAI(param_key);

    const prompt = `
You are performing PRODUCT IMAGE REPLICATION.

====================
ABSOLUTE RULES
====================
- ONLY ONE OBJECT: the product.
- NO people, NO hands, NO props.
- NO background, NO lifestyle.
- Remove the background to focus on the image.
- Studio packshot photography.
- Highlight the image to focus solely on the product.
- Improve the resolution for sharpness.

====================
PRODUCT KEY
====================
- The images provided are FINALLY APPROVED PRODUCTS.
- Accurate product replication:
  - Same shape and proportions
  - Same cap/pump/lid
  - Same label, text, and graphic layout
  - Same color and finish
- Avoid redesigning.
- Avoid embellishing.
- Avoid reinterpreting.

====================
CAMERA
====================
- Front-facing
- Neutral studio lighting
- No shadows
- No reflection distortion

====================
OUTPUT
====================
A high-resolution PNG image.
The product must be visually indistinguishable from the reference.
`;

    const mimeType = getMimeTypeFromBase64(product_b64);

    try {
      const response = await ai.models.generateContent({
        model: MODELS.IMAGE,
        contents: {
          parts: [
            { inlineData: { data: product_b64, mimeType: mimeType } },
            { text: prompt }
          ]
        },
        config: {
          imageConfig: { aspectRatio: aspect_ratio as any }
        }
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const img = parts.find(p => p.inlineData)?.inlineData?.data;

      if (!img) throw new Error("Product lock image generation failed.");

      return img;

    } catch (e: any) {
      // Retry logic for transient errors
        if (max_retries > 0) {
            console.warn(`[GeminiService] Error in generateLockedProductImage, retrying... (${max_retries} retries left)`, e);
            return await aiService.generateLockedProductImage(product_b64, aspect_ratio, true, max_retries - 1);
        }
      throw new Error(translateGeminiError(e, "generateLockedProductImage"));
    }
  },


  /**
   * Menghasilkan gambar adegan dengan referensi visual produk & karakter.
   * IMPROVEMENT: Treats the product image as an IMMUTABLE layer to preserve fidelity.
   */
  async generateFirstSceneImage(
      api_key : string,
      prompt_visual: string,
      additional_prompt: string,
      storyboard_chunk: StoryboardJSON,
      locked_product_b64: string,
      characters: Array<Character & { b64: string }>,
      aspect_ratio: string
  ) {
    console.log({
        "[GeminiService] Generating First Scene Image with params:": {
            prompt_visual,
            additional_prompt,
            storyboard_chunk,
            locked_product_b64: locked_product_b64 ? "[REDACTED BASE64]" : "MISSING",
            characters,
            aspect_ratio
        }
    });

    let current_key = api_key ? api_key : getEffectiveApiKey();

    // set process.env.API_KEY to current_key for downstream usage in GoogleGenAI if needed
    
    console.log("Current API Key Prefix:", current_key ? current_key.slice(0, 8) + "..." : "No Key");
    const param_key = {
        apiKey : current_key
    }
    console.log("generateFirstSceneImage param_key", {param_key})

    const ai = new GoogleGenAI(param_key);
    const product_mime_type = getMimeTypeFromBase64(locked_product_b64);

    // const char_details = characters.map((c, idx) => {
    //   const label = `@actor${(idx + 1).toString().padStart(2, '0')}`;
    //   return `${label}: Represented by a professional actor. Role: ${c.name}, Desc: ${c.description}`;
    // }).join(" | ");

    const first_scene = storyboard_chunk.scenes?.[0];

    // const char_mentions = characters.map((_, idx) => `@actor${(idx + 1).toString().padStart(2, '0')}`).join(", ");

    console.log("generateFirstSceneImage characters", {characters})
    const char_labels = characters.map((_, idx) => `@image${idx + 2}`); // Start from 2 because @image1 is product
    const all_actors_list = char_labels.join(" and ");

    const prompt_text = `
    [PIXEL-PERFECT PRODUCT INTEGRATION]:
    - The product must be the visual anchor of the scene, fully visible and undistorted.
    - @image1 (Product) is the STATIC ANCHOR of this scene.
    - Characters (${all_actors_list}) should interact with the product naturally, without obscuring it.
   
    [SCENE CONTEXT]:
    
    ${prompt_visual}
    
    
    [EXECUTION & STYLE]:
    
    - Setting: ${first_scene?.setting}.
    
    - Action: ${first_scene?.actions.join(", ")}.
    
    - Camera: Medium-Wide shot to ensure everyone and the product are fully framed.
    
    - Lighting: Studio commercial lighting that preserves the original colors of @image1.
    
    - Style: Professional 8k photography, no artistic filters that distort product color.
   
    [FINAL TASK]:
    Combine the @image1 as product and ${characters.map((c, i) => `- @image${i + 2}`).join("\n")}`;

    console.log("[GeminiService] First Scene Prompt:", prompt_text);


    const parts: any[] = [
      { inlineData: { data: locked_product_b64, mimeType: product_mime_type} } // @image1 is the locked product
    ];
    characters.forEach((char) => {
      console.log("[GeminiService] Adding character image to prompt parts.", { name: char.name, b64Length: char.b64.length });
      const char_b64 = char.b64;
      console.log("[GeminiService] Character base64 sample:", char_b64.substring(0, 30) + "...");
      const mimeType = getMimeTypeFromBase64(char_b64);
      parts.push({ inlineData: { data: char.b64, mimeType: mimeType } });
    });
    parts.push({ text: prompt_text });

    try {
      const response = await ai.models.generateContent({
        model: MODELS.IMAGE,
        contents: { parts },
        config: { imageConfig: { aspectRatio: aspect_ratio as any } }
      });

      let base64 = '';
      let refusalText = '';
      const responseParts = response.candidates?.[0]?.content?.parts || [];

      for (const part of responseParts) {
        if (part.inlineData) {
          base64 = part.inlineData.data;
        } else if (part.text) {
          refusalText = part.text;
        }
      }

      if (!base64 && refusalText) {
        throw new Error(refusalText);
      }

      if (!base64) throw new Error("Gagal mensintesis gambar adegan.");
      return base64;
    } catch (e: any) {
      console.error("[GeminiService] Image Gen Error:", e);
      throw new Error(translateGeminiError(e, "generateFirstSceneImage"));
    }
  },

  /**
   * Analisa gambar scene pertama untuk visual description & TTS parameters.
   */
  async analyzeFirstSceneImage(
      first_scene_base64: string,
      prompt_visual: string,
      characters: Character[] = [],
      product_json: any = {}
  ) {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });

    const product_hint = `PRODUCT HINT: ${product_json.name || "Unknown"} | ${product_json.description || "N/A"}`;
    let character_hint = `CHARACTER HINTS:`;
    for (const c of characters) {
      character_hint += `\n- ${c.name} (${c.gender}): ${c.description}`;
    }

    const master_prompt = `
You are a commercial director and visual prompt engineer.

TASK:
Analyze the provided image and generate:
1. description_first_image: A highly detailed VISUAL-ONLY prompt for AI Video (no sound mentions).
2. voice_over_text: A natural, short, and conversational Indonesian dialogue/narration matching the scene.

VOICE CASTING RULES:
- Choose from these Gemini TTS voices:
  - Female: Kore, Aoede, Leda, Callirrhoe, Erinome, Pulcherrima, Zephyr
  - Male: Achird, Algenib, Algieba, Alnilam, Charon, Enceladus, Fenrir, Orus, Puck
- speaking_rate: 0.9 - 1.0.
- pause_hint: short, medium, long.

IMAGE CONTEXT:
${product_hint}
${character_hint}
Scene Intent: ${prompt_visual}

OUTPUT: JSON only.
`;

    try {
      const response = await ai.models.generateContent({
        model: MODELS.VISION,
        contents: {
          parts: [
            {
              inlineData: {
                data: first_scene_base64.includes(',') ? first_scene_base64.split(',')[1] : first_scene_base64,
                mimeType: "image/png",
              },
            },
            {
              text: master_prompt,
            },
          ],
        },
        config: {
          temperature: 0.35,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description_first_image: { type: Type.STRING },
              voice_over_text: { type: Type.STRING },
              language_code: { type: Type.STRING, enum: ["id-ID"] },
              gender_voice: { type: Type.STRING, enum: ["male", "female"] },
              voice_name: {
                type: Type.STRING,
                enum: [
                  "achernar","aoede","autonoe","callirrhoe","despina",
                  "erinome","gacrux","kore","laomedeia","leda",
                  "pulcherrima","sulafat","vindemiatrix","zephyr",
                  "achird","algenib","algieba","alnilam","charon",
                  "enceladus","fenrir","iapetus","orus","puck",
                  "rasalgethi","sadachbia","sadaltager","schedar",
                  "umbriel","zubenelgenubi"
                ],
              },
              speaking_rate: { type: Type.NUMBER, minimum: 0.9, maximum: 1.0 },
              pause_hint: { type: Type.STRING, enum: ["short", "medium", "long"] },
            },
            required: [
              "description_first_image",
              "voice_over_text",
              "language_code",
              "gender_voice",
              "voice_name",
              "speaking_rate",
              "pause_hint",
            ],
          },
        },
      });

      let jsonStr = (response.text || "").trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      }

      return JSON.parse(jsonStr);

    } catch (e: any) {
      console.error("[GeminiService] analyzeFirstSceneImage error:", e);
      throw new Error(translateGeminiError(e, "analyzeFirstSceneImage"));
    }
  },

  /**
   * Analyze scene image into a HIGH-FIDELITY Veo text-to-video prompt.
   */
  async analyzeSceneForVeo(
      scene_base64: string,
      base_visual_description: string,
      max_refine_loop = 2
  ) {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const mimeType = getMimeTypeFromBase64(scene_base64);

    const groundingPrompt = `
    Analyze the image facts:
    - Product: shape, color, branding.
    - Characters: appearance, clothes.
    - Scene: setting, lighting.
    Output bullet points.
    `;

    const groundingRes = await ai.models.generateContent({
      model: MODELS.VISION,
      contents: {
        parts: [
          { inlineData: { data: scene_base64.includes(',') ? scene_base64.split(',')[1] : scene_base64, mimeType } },
          { text: groundingPrompt },
        ],
      },
    });

    const groundedFacts = groundingRes.text?.trim() || "";

    return {
      veo_prompt: `Cinematic Commercial. Visual Lock: ${base_visual_description}. Ground Truth: ${groundedFacts}`,
      negative_prompt: "cartoon, illustration, CGI, anime, fantasy, blurry, text overlay",
      camera_motion: "Slow cinematic pan or static framing",
      subject_motion: "Natural subtle movements",
      scene_continuity_notes: "Keep product branding 100% consistent with the seed frame."
    };
  },

  /**
   * Menghasilkan video menggunakan Veo 3.1.
   * IMPROVEMENT: Added Storyboard context for better narrative coherence and Lip-Sync/Subtitle directives.
   */
  async generateVideoVeo31(
      api_key: string,
      image_base64: string,
      prompt_text: string,
      aspect_ratio: string,
      characters: Character[] = [],
      resolution="720p",
      storyboard?: StoryboardJSON,
      model = "",
      max_retries = 3
  ) {
    console.log("[GeminiService] Model for Video Generation:", model || MODEL_VIDEOS["veo-3.1"]);
    console.log({
        "[GeminiService] Generating Video Veo 3.1 with params:": {
            aspect_ratio,
            resolution,
            characters,
            storyboard: storyboard ? "[REDACTED STORYBOARD]" : "MISSING",
            prompt_text,
            image_base64: image_base64 ? "[REDACTED BASE64]" : "MISSING",
            model,
            api_key
        }
    })
    const current_key = api_key ? api_key : getEffectiveApiKey();
    console.log("Current API Key Prefix:", current_key ? current_key.slice(0, 8) + "..." : "No Key");
    let param_key = {
      apiKey : current_key
    }

    console.log("generateVideoVeo31 param_key", {param_key})
    const ai = new GoogleGenAI( param_key);

    let mimeType = getMimeTypeFromBase64(image_base64);
    if (!mimeType.startsWith('image/')) {
      throw new Error("Tipe data gambar tidak dikenali atau tidak valid.");
    }

    if(!model) {
      model = MODEL_VIDEOS["veo-3.1"]
    }

    console.log("generateVideoVeo31 characters", {characters})

    // 1. BERSIHKAN BASE64 (Sangat Penting!)
    // Menghapus prefix "data:image/jpeg;base64," jika ada
    const cleanBase64 = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;

    const audio_directives = `
    [AUDIO CHARACTERISTICS & VOCAL DESIGN]
    - Vocal Realism: High-fidelity natural human speech, relaxed (santai) and authentic tone.
    - Sound Cues: Include subtle human-like filler words, natural pauses, and organic breaths between sentences.
    - Acoustics: Sound environment must resonate naturally with the setting.
    - Unique Voice Profiles:
    ${characters.map(c => `  * ${c.name} (${c.gender}): Voice should be distinct and characteristic of their persona.`).join('\n')}
    - Strictly avoid robotic or flat monotonous AI-generated voices. Use dynamic intonation.
    `;

    let final_enhanced_prompt = `${prompt_text}\n\n${audio_directives}`;

    // final_enhanced_prompt = `Detail the json scenes : ${storyboard ? JSON.stringify(storyboard) : ""}\n\n${final_enhanced_prompt}`;

    console.log("[GeminiService] Final Veo 3.1 Prompt:", final_enhanced_prompt);

    try {
      let operation = await ai.models.generateVideos({
        model: model,
        prompt: final_enhanced_prompt,
        image: { imageBytes: cleanBase64, mimeType: mimeType },
        config: { numberOfVideos: 1, resolution: resolution, aspectRatio: aspect_ratio as any }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const rai_reasons = (operation.response as any)?.raiMediaFilteredReasons;
      if (rai_reasons && Array.isArray(rai_reasons) && rai_reasons.length > 0) {
        throw new Error(`Filter Keamanan Aktif: ${rai_reasons.join(". ")}`);
      }

      const download_link = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!download_link) throw new Error("Link unduhan video tidak ditemukan.");

      const response = await fetch(`${download_link}&key=${current_key}`);
      if (!response.ok) throw new Error("Gagal mengunduh video hasil sintesis.");

      return await response.blob();

    // const cleanBase64 = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;
    //
    // const narrative_context = storyboard
    //     ? `NARRATIVE ARC: ${storyboard.description}\nPRODUCTION NOTES: ${storyboard.production_notes}`
    //     : "";
    //
    // const synchronization_directives = `
    // [AUDIO-VISUAL SYNCHRONIZATION & LIP-SYNC]
    // - Characters in frame MUST exhibit natural lip-sync matching the spoken Indonesian dialogue.
    // - Facial expressions must convey the emotions of the dialogue naturally.
    // - Audio Delivery: Professional commercial tone, clear articulation.
    //
    // [BURNT-IN CAPTIONS/SUBTITLES]
    // - Display clear, readable WHITE SUBTITLES with a subtle black drop shadow at the BOTTOM CENTER of the screen.
    // - Subtitles MUST match the spoken dialogue exactly.
    // `;
    //
    // const final_enhanced_prompt = `
    // ${narrative_context}
    //
    // SCENE SCRIPT:
    // ${prompt_text}
    //
    // ${synchronization_directives}
    //
    // [PRODUCT FIDELITY]
    // - The product branding, labels, and colors from the seed image must be preserved without any distortion throughout the video.
    // `;
    //
    // try {
    //   let operation = await ai.models.generateVideos({
    //     model: MODELS.VIDEO, // Assuming MODELS.VIDEO points to veo-3.1-generate-preview
    //     prompt: final_enhanced_prompt,
    //     image: { imageBytes: cleanBase64, mimeType: 'image/png' },
    //     config: { numberOfVideos: 1, resolution: resolution, aspectRatio: aspect_ratio as any }
    //   });
    //
    //   while (!operation.done) {
    //     await new Promise(resolve => setTimeout(resolve, 10000));
    //     operation = await ai.operations.getVideosOperation({ operation: operation });
    //   }
    //
    //   const rai_reasons = (operation.response as any)?.raiMediaFilteredReasons;
    //   if (rai_reasons && Array.isArray(rai_reasons) && rai_reasons.length > 0) {
    //     throw new Error(`Safety Filter Triggered: ${rai_reasons.join(". ")}`);
    //   }
    //
    //   const download_link = operation.response?.generatedVideos?.[0]?.video?.uri;
    //   if (!download_link) throw new Error("Video download link not found.");
    //
    //   const response = await fetch(`${download_link}&key=${current_key}`);
    //   return await response.blob();
    } catch (e: any) {
      console.log("[GeminiService] Veo 3.1 Generation Error:", e);
      // if error have string message : You exceeded your current quota
        // try again with another model MODEL_VIDEOS["veo-3.1-preview"]
        if(max_retries === 0) {
          throw new Error(translateGeminiError(e, "generateVideoVeo31"));
        }

        return await aiService.generateVideoVeo31(
          current_key,
          image_base64,
          prompt_text,
          aspect_ratio,
          characters,
          resolution,
          storyboard,
          MODEL_VIDEOS["veo-3.1-preview"],
          max_retries - 1
        );
    }
  },

  async sanitizePromptForVeo30(rawPrompt: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const instruction = `Rewrite for Veo 3.0 Fast: 100% visual-only, no speech. Safety compliant. Output text only: ${rawPrompt}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: instruction }] }],
      config: { temperature: 0.15, maxOutputTokens: 2048 },
    });
    return response.text?.trim() || "";
  },

  async sanitizePromptForVeo31(rawPrompt: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const instruction = `Normalize for Veo 3.1: Audio/Speech allowed. Enforce safety. Output text only: ${rawPrompt}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: instruction }] }],
      config: { temperature: 0.25, maxOutputTokens: 3072 },
    });
    return response.text?.trim() || "";
  },

  async generateVideoVeo30(
      describe_scene_prompt : string,
      prompt_text: string,
      aspect_ratio: string,
      Characters: Character[] = [],
      product_json: any = {}
  ): Promise<Blob> {
    const current_key = getEffectiveApiKey();
    const ai = new GoogleGenAI({ apiKey: current_key });

    const final_prompt = `Visual: ${describe_scene_prompt}. Narrative: ${prompt_text}. No sound.`;
    const sanitized_prompt = await aiService.sanitizePromptForVeo30(final_prompt);

    try {
      let operation = await ai.models.generateVideos({
        model: "veo-3.0-fast-generate-001",
        prompt: sanitized_prompt,
        config: { numberOfVideos: 1, resolution: "720p", aspectRatio: aspect_ratio as any },
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) throw new Error("Video URI not found.");
      const res = await fetch(`${uri}&key=${current_key}`);
      return await res.blob();
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "generateVideoVeo30"));
    }
  },

  async generateVideoVeo30WithAudio(
      veo_analysis: any,
      voice_analysis: any,
      aspect_ratio: string
  ): Promise<Blob> {
    const current_key = getEffectiveApiKey();
    const ai = new GoogleGenAI({ apiKey: current_key });
    const final_prompt = `${veo_analysis.veo_prompt}. Audio script: ${voice_analysis.voice_over_text}.`;
    const sanitized_prompt = await aiService.sanitizePromptForVeo31(final_prompt);

    try {
      let operation = await ai.models.generateVideos({
        model: "veo-3.0-generate-001",
        prompt: sanitized_prompt,
        config: { numberOfVideos: 1, resolution: "720p", aspectRatio: aspect_ratio as any },
      });
      while (!operation.done) {
        await new Promise((r) => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }
      const res = await fetch(`${operation.response?.generatedVideos?.[0]?.video?.uri}&key=${current_key}`);
      return await res.blob();
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "generateVideoVeo30WithAudio"));
    }
  },

  async generateVideoVeo30FastPreviewImageToVideo(
      image_base64: string,
      prompt_text: string,
      aspect_ratio: string
  ): Promise<Blob> {
    const apiKey = getEffectiveApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
    try {
      let operation = await ai.models.generateVideos({
        model: MODEL_VIDEOS["veo-3.0-preview"],
        prompt: `Preserve first frame exactly. Narrative: ${prompt_text}`,
        image: { imageBytes: cleanBase64, mimeType: "image/png" },
        config: { numberOfVideos: 1, resolution: "720p", aspectRatio: aspect_ratio as any },
      });
      while (!operation.done) {
        await new Promise((r) => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }
      const res = await fetch(`${operation.response?.generatedVideos?.[0]?.video?.uri}&key=${apiKey}`);
      return await res.blob();
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "generateVideoVeo30FastPreviewImageToVideo"));
    }
  },

  async generateTTSFromAnalysis(analysis: {
    voice_over_text: string;
    voice_name: string;
    speaking_rate: number;
    pause_hint: "short" | "medium" | "long";
    gender_voice: string,
  }): Promise<Blob>  {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const full_prompt = `Speak Indonesian: ${analysis.voice_over_text}. Voice: ${analysis.gender_voice}. Rate: ${analysis.speaking_rate}. Pacing: ${analysis.pause_hint}.`;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: full_prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: normalizeVoiceName(analysis.voice_name) },
            },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes.buffer], { type: "audio/L16;codec=pcm;rate=24000" });
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "generateTTSFromAnalysis"));
    }
  }
};
