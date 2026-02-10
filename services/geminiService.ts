
import { GoogleGenAI, Type, Modality } from "@google/genai";
import {ALLOWED_GEMINI_VOICES, MODEL_VIDEOS, MODELS, TARGET_CONTENT} from "../constants";
import { StoryboardJSON, StoryboardScene, Character } from "../types";
import {getMimeTypeFromBase64} from "@/utils";

const getEffectiveApiKey = (): string => {
  return process.env.API_KEY || '';
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
  generateStoryboardChunk: async (data: any, existing_scenes: StoryboardScene[] = [], retryCount = 0): Promise<StoryboardJSON> => {
    let apiKey = getEffectiveApiKey();
    console.log("[GeminiService] Using API Key Prefix:", apiKey ? apiKey.slice(0, 8) + "..." : "No Key");
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const MAX_RETRIES = 4;

    // Di dalam generateStoryboardChunk
    const lastScenes = existing_scenes.slice(-2); // Cukup 2 adegan terakhir
    const totalScenes = existing_scenes.length;

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
  generateLockedProductImage: async (
      product_b64: string,
      aspect_ratio: string
  ): Promise<string> => {

    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });

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

    try {
      const response = await ai.models.generateContent({
        model: MODELS.IMAGE,
        contents: {
          parts: [
            { inlineData: { data: product_b64, mimeType: "image/png" } }, // @image1 = PRODUCT MASTER
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
      throw new Error(translateGeminiError(e, "generateLockedProductImage"));
    }
  },


  /**
   * Menghasilkan gambar adegan dengan referensi visual produk & karakter.
   * IMPROVEMENT: Mengubah wording prompt untuk menghindari filter 'deepfake/privacy'
   * dengan menekankan pada 'Commercial Scene with Actors' dan menangkap refusal text.
   */
  generateFirstSceneImage: async (
      storyboard_chunk: StoryboardJSON,
      product_b64: string | null,
      characters: Array<Character & { b64: string }>,
      aspect_ratio: string
  ) => {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const first_scene = storyboard_chunk.scenes?.[0];

    const char_details = characters.map((c, idx) => {
      const label = `@actor${(idx + 1).toString().padStart(2, '0')}`;
      return `${label}: Represented by a professional actor. Role: ${c.name}, Desc: ${c.description}`;
    }).join(" | ");

    const char_mentions = characters.map((_, idx) => `@actor${(idx + 1).toString().padStart(2, '0')}`).join(", ");

    const prompt_text = `
    A high-end cinematic commercial photography for a lifestyle campaign., You are composing a COMMERCIAL SCENE.
    
    TECHNICAL DIRECTIVES:
    1. Use provided images as visual references for the product and the actors.
    2. The product MUST be the central focal point, clearly visible and sharp and not modify image product.
    3. The actors representing ${char_mentions} must interact naturally in a professional commercial setting.
    4. Photography Style: 85mm f/1.4 lens, 8K resolution, cinematic color grading, sharp focus on subject.
    5. You can change the clothes worn by the character with appropriate clothes.
    
    SAFETY GUIDELINES:
    - Depict fictional characters in a fictional commercial scene.
    - NO real-world celebrities. NO children.
    - Focus on aesthetic high-quality lifestyle photography.
    
    SCENE CONTENT: ${first_scene?.actions.join(", ")}. 
    SETTING: ${first_scene?.setting}. 
    LIGHTING: ${first_scene?.lighting}.
    
    ====================
    CAMERA
    ====================
    - Stable framing
    - Product centered or foreground
    - Cinematic depth, but product remains sharp

    CHARACTER DETAILS:
    ${char_details}
    
    OUTPUT: A single high-quality PNG image representing the scene as described.
    `;

    const parts: any[] = [];
    if (product_b64) parts.push({ inlineData: { data: product_b64, mimeType: 'image/png' } });
    characters.forEach((char) => {
      parts.push({ inlineData: { data: char.b64, mimeType: 'image/png' } });
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

      // Jika tidak ada data gambar tapi ada teks penolakan dari model
      if (!base64 && refusalText) {
        throw new Error(refusalText);
      }

      if (!base64) throw new Error("Gagal mensintesis gambar (Respons Kosong dari Model).");
      return base64;
    } catch (e: any) {
      console.error("[GeminiService] Image Gen Error:", e);
      throw new Error(translateGeminiError(e));
    }
  },



//   /**
//    * PASS 2 — Scene composition using LOCKED product image
//    */
//   generateFirstSceneImage: async (
//       storyboard_chunk: StoryboardJSON,
//       locked_product_b64: string, // ⬅️ hasil PASS-1
//       characters: Array<Character & { b64: string }>,
//       aspect_ratio: string
//   ): Promise<string> => {
//
//     const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
//     const first_scene = storyboard_chunk.scenes?.[0];
//
//     const char_details = characters.map((c, idx) => {
//       const label = `@actor${idx + 1}`;
//       return `${label}: professional actor, ${c.description}`;
//     }).join("\n");
//
//     const prompt = `
// You are composing a COMMERCIAL SCENE.
//
// ====================
// PRODUCT — IMMUTABLE
// ====================
// - @image1 is a FINAL PRODUCT ASSET.
// - DO NOT redraw, repaint, relight, or modify it.
// - The product appearance MUST remain EXACT.
//
// ====================
// SCENE RULES
// ====================
// - Characters may exist AROUND the product.
// - Characters MUST NOT touch or cover the product.
// - Product stays visually dominant and unchanged.
//
// ====================
// SCENE DETAILS
// ====================
// Actions:
// ${first_scene?.actions.join(", ")}
//
// Setting:
// ${first_scene?.setting}
//
// Lighting:
// Soft commercial lighting. Product lighting neutral and consistent.
//
// ====================
// CHARACTERS
// ====================
// ${char_details}
//
// ====================
// CAMERA
// ====================
// - Stable framing
// - Product centered or foreground
// - Cinematic depth, but product remains sharp
//
// ====================
// OUTPUT
// ====================
// One high-quality PNG image.
// `;
//
//     const parts: any[] = [
//       { inlineData: { data: locked_product_b64, mimeType: "image/png" } } // @image1
//     ];
//
//     characters.forEach(c =>
//         parts.push({ inlineData: { data: c.b64, mimeType: "image/png" } })
//     );
//
//     parts.push({ text: prompt });
//
//     try {
//       const response = await ai.models.generateContent({
//         model: MODELS.IMAGE,
//         contents: { parts },
//         config: {
//           imageConfig: { aspectRatio: aspect_ratio as any }
//         }
//       });
//
//       const resultParts = response.candidates?.[0]?.content?.parts || [];
//       const img = resultParts.find(p => p.inlineData)?.inlineData?.data;
//
//       if (!img) throw new Error("Scene image generation failed.");
//
//       return img;
//
//     } catch (e: any) {
//       throw new Error(translateGeminiError(e, "generateFirstSceneImage"));
//     }
//   },


  /**
   * Analisa gambar scene pertama untuk:
   * - visual description (untuk Veo 3.0 Fast)
   * - voice over text (untuk TTS + lipsync)
   */
  analyzeFirstSceneImageWithoutAudio: async (
      first_scene_base64: string,
      prompt_visual: string,
      characters: Character[] = [],
      product_json: any = {}
  ) => {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });

    const prompt = `
You are a professional commercial director, product analyst,
and voice casting expert.

TASK:
Analyze the provided image and produce:
1. A highly detailed visual description for cinematic video generation (silent).
2. Natural Indonesian voice-over text suitable for lip-sync.
3. Voice casting parameters optimized for Gemini-TTS.

STRICT RULES:
- Base ALL descriptions strictly on the image.
- DO NOT hallucinate unseen details.
- Use HEX color codes for product colors.
- Describe product shape, dimensions, material, and finish clearly.
- Describe characters: skin tone, face shape, outfit, posture.
- Visual description MUST be silent (no mention of audio or speech).
- Voice-over text MUST be Bahasa Indonesia (id-ID), casual, short, and conversational.

VOICE CASTING RULES:
- Choose ONE Gemini-TTS prebuilt voice persona.
- Available voices:

Female:
Achernar, Aoede, Autonoe, Callirrhoe, Despina, Erinome,
Gacrux, Kore, Laomedeia, Leda, Pulcherrima, Sulafat,
Vindemiatrix, Zephyr

Male:
Achird, Algenib, Algieba, Alnilam, Charon, Enceladus,
Fenrir, Iapetus, Orus, Puck, Rasalgethi, Sadachbia,
Sadaltager, Schedar, Umbriel, Zubenelgenubi

- Select a voice that sounds natural and pleasant for Indonesian speech.
- Prefer friendly commercial narration style.

PROSODY RULES:
- speaking_rate: between 0.9 and 1.0 (default 0.95)
- pause_hint:
  short  → energetic
  medium → calm
  long   → emotional

OUTPUT FORMAT:
JSON only.
`;

    // product prompt
    //      {
    //             "id" : 1,
    //             "name" : "Name of product",
    //             "sku" : "SKU of product",
    //             "description" : "",
    //             "prompt_description" : "description of prompt format",
    //             "dimension" : "Real Dimension Of Product, P x L x t",
    //             "image_url" : "Url from image"
    //       }
    const product_prompt = `PRODUCT DETAILS:
- Name: ${product_json.name || "N/A"}
- SKU: ${product_json.sku || "N/A"}
- Description: ${product_json.description || "N/A"}
- Dimensions In Centimeter: ${product_json.dimension || "N/A"}
`

    //     {
    //           "id" : 1,
    //           "name" : "Name Of Character",
    //           "gender" : "MALE|FEMALE",
    //           "description" : "Description of character",
    //           "prompt" : "Prompt for build character"
    //       }

    let character_prompt = `Details of Characters in the Scene:`;

    //foreach character
    for (const character of characters) {
        character_prompt += `
- Name: ${character.name} 
    Description: ${character.description} , With Detail : ${character.prompt}
`;
    }

    const final_prompt = [product_prompt, character_prompt, prompt].join("\n");

      let mimeType = getMimeTypeFromBase64(first_scene_base64);
      if (!mimeType.startsWith('image/')) {
          throw new Error("Tipe data gambar tidak dikenali atau tidak valid.");
      }

    try {
      const response = await ai.models.generateContent({
        model: MODELS.VISION, // e.g. gemini-2.0-flash
        contents: {
          parts: [
            {
              inlineData: {
                data: first_scene_base64,
                mimeType: "image/png",
              },
            },
            {
              text: `
${final_prompt}

IMAGE CONTEXT PROMPT:
${prompt_visual}
`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          temperature: 0.4,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description_first_image: { type: Type.STRING },

              voice_over_text: { type: Type.STRING },

              language_code: {
                type: Type.STRING,
                enum: ["id-ID"],
              },

              gender_voice: {
                type: Type.STRING,
                enum: ["male", "female"],
              },

              voice_name: {
                type: Type.STRING,
                enum: [
                  // Female
                  "achernar","aoede","autonoe","callirrhoe","despina",
                  "erinome","gacrux","kore","laomedeia","leda",
                  "pulcherrima","sulafat","vindemiatrix","zephyr",

                  // Male
                  "achird","algenib","algieba","alnilam","charon",
                  "enceladus","fenrir","iapetus","orus","puck",
                  "rasalgethi","sadachbia","sadaltager","schedar",
                  "umbriel","zubenelgenubi"
                ],
              },

              speaking_rate: {
                type: Type.NUMBER,
                minimum: 0.9,
                maximum: 1.0,
              },

              pause_hint: {
                type: Type.STRING,
                enum: ["short", "medium", "long"],
              },
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
          }

        },
      });

      let jsonStr = (response.text || "{}").trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr
            .replace(/^```json\n?/, "")
            .replace(/\n?```$/, "")
            .trim();
      }

      // check if valid JSON
      try{
        const data = JSON.parse(jsonStr);
        if(!data.description_first_image || !data.voice_over_text) {
            throw new Error("JSON valid tapi konten tidak lengkap. Mungkin model gagal menghasilkan konten yang sesuai. Coba lagi.");
        }
      }catch (e) {
        // try request again
        return aiService.analyzeFirstSceneImage(first_scene_base64, prompt_visual, characters, product_json);
      }

      return JSON.parse(jsonStr);
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "analyzeFirstSceneImage"));
    }
  },


  /**
   * Analisa gambar scene pertama untuk:
   * - visual description (untuk Veo 3.0 Fast)
   * - voice over text (untuk TTS + lipsync)
   */
  /**
   * Analisa gambar scene pertama untuk:
   * - visual description (grounded & prompt-ready for text-to-video)
   * - voice over text (Bahasa Indonesia, casual, short)
   *
   * IMPORTANT:
   * - Image is the ONLY source of truth
   * - Product & character data are only soft hints
   * - Zero hallucination tolerance
   */
  analyzeFirstSceneImage: async (
      first_scene_base64: string,
      prompt_visual: string,
      characters: Character[] = [],
      product_json: any = {}
  ) => {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });

    const mimeType = getMimeTypeFromBase64(first_scene_base64);
    if (!mimeType.startsWith("image/")) {
      throw new Error("Tipe data gambar tidak valid.");
    }

    /* ------------------------------
     * PRODUCT & CHARACTER CONTEXT
     * (HINT ONLY — NOT FACT SOURCE)
     * ------------------------------ */
    const product_hint = `
PRODUCT HINT (for validation only, not imagination):
- Name: ${product_json.name || "Unknown"}
- SKU: ${product_json.sku || "Unknown"}
- Claimed Dimension (cm): ${product_json.dimension || "Unknown"}
`;

    let character_hint = `CHARACTER HINTS (do NOT invent if not visible):`;
    for (const c of characters) {
      character_hint += `
- Name: ${c.name}
  Gender: ${c.gender}
  Description Hint: ${c.description}
  Prompt Hint: ${c.prompt}
`;
    }

    /* ------------------------------
     * CORE MASTER PROMPT
     * ------------------------------ */
    const master_prompt = `
You are a senior commercial director, visual analyst, and prompt engineer.

====================
ABSOLUTE RULES
====================
1. The IMAGE is the ONLY source of truth.
2. Describe ONLY what is clearly visible.
3. DO NOT guess, infer, or beautify unseen details.
4. If a detail is unclear, state it as "not clearly visible".
5. No storytelling, no emotion, no audio reference in visual description.
6. Colors MUST use HEX codes if visible.
7. Dimensions MUST be comparative (e.g., "fits in one hand", "bottle-sized").
8. Characters are actors in a commercial scene, not real people.

====================
PHASE 1 — VISUAL GROUNDING (SILENT)
====================
Analyze the image and internally identify:
- Product: shape, material, finish, color, relative size, orientation
- Characters: skin tone, face shape, outfit, posture, relative scale
- Scene: setting, lighting, camera angle, composition
- Spatial relations: distance, foreground/background, interaction

====================
PHASE 2 — OUTPUT SYNTHESIS
====================
Using ONLY the grounded visual facts, generate:

1. description_first_image
   - Single detailed paragraph
   - Written as a READY-TO-USE visual prompt for text-to-video
   - No audio, no voice, no narration words

2. voice_over_text
   - Bahasa Indonesia (id-ID)
   - Casual, friendly, commercial tone
   - Short (1–2 sentences)
   - Conversational, natural

====================
VOICE CASTING RULES
====================
- Choose ONE Gemini TTS prebuilt voice
- Sound natural for Indonesian language
- Friendly commercial narration

====================
PROSODY RULES
====================
- speaking_rate: 0.9 – 1.0 (ideal 0.95)
- pause_hint:
  short  → energetic
  medium → calm
  long   → emotional

====================
VALIDATION CONTEXT
====================
${product_hint}

${character_hint}

SCENE INTENT (NOT VISUAL FACT):
${prompt_visual}

====================
OUTPUT
====================
Return JSON ONLY.
`;

    try {
      const response = await ai.models.generateContent({
        model: MODELS.VISION,
        contents: {
          parts: [
            {
              inlineData: {
                data: first_scene_base64,
                mimeType: mimeType,
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
              language_code: {
                type: Type.STRING,
                enum: ["id-ID"],
              },
              gender_voice: {
                type: Type.STRING,
                enum: ["male", "female"],
              },
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
              speaking_rate: {
                type: Type.NUMBER,
                minimum: 0.9,
                maximum: 1.0,
              },
              pause_hint: {
                type: Type.STRING,
                enum: ["short", "medium", "long"],
              },
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

      const parsed = JSON.parse(jsonStr);

      if (!parsed.description_first_image || !parsed.voice_over_text) {
        throw new Error("Konten JSON tidak lengkap.");
      }

      return parsed;

    } catch (e: any) {
      console.error("[GeminiService] analyzeFirstSceneImage error:", e);
      throw new Error(translateGeminiError(e, "analyzeFirstSceneImage"));
    }
  },
  /**
   * Analyze scene image into a HIGH-FIDELITY Veo text-to-video prompt.
   * Uses multi-pass grounding + self-refinement loop.
   */
  analyzeSceneForVeo: async (
      scene_base64: string,
      base_visual_description: string, // from analyzeFirstSceneImage.description_first_image
      max_refine_loop = 2
  ) => {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });

    const mimeType = getMimeTypeFromBase64(scene_base64);
    if (!mimeType.startsWith("image/")) {
      throw new Error("Invalid image input for Veo analysis.");
    }

    /* ----------------------------------
     * PHASE 1 — HARD VISUAL GROUNDING
     * ---------------------------------- */
    const groundingPrompt = `
You are a vision grounding system.

RULES:
- The image is the ONLY source of truth.
- No cinematic language.
- No motion description.
- No interpretation.
- No audio reference.

TASK:
List visual facts ONLY in bullet points:
- Product (shape, color HEX, material, finish, relative size)
- Characters (appearance, clothing, posture)
- Scene (location type, lighting, camera angle)
- Spatial relations
`;

    const groundingRes = await ai.models.generateContent({
      model: MODELS.VISION,
      contents: {
        parts: [
          { inlineData: { data: scene_base64, mimeType } },
          { text: groundingPrompt },
        ],
      },
      config: { temperature: 0.2 },
    });

    const groundedFacts = groundingRes.text?.trim() || "";

    /* ----------------------------------
     * PHASE 2 — MOTION EXTRACTION
     * ---------------------------------- */
    const motionPrompt = `
Based STRICTLY on these visual facts:

${groundedFacts}

TASK:
1. Describe camera motion (or say "static camera").
2. Describe subject motion (or say "minimal movement").
3. Motion must be physically plausible.
4. No new objects.
`;

    const motionRes = await ai.models.generateContent({
      model: MODELS.VISION,
      contents: [{ text: motionPrompt }],
      config: { temperature: 0.3 },
    });

    const motionText = motionRes.text || "";

    /* ----------------------------------
     * PHASE 3 — INITIAL VEO PROMPT
     * ---------------------------------- */
    let veoPrompt = `
Cinematic commercial video.

VISUAL LOCK:
${base_visual_description}

GROUND TRUTH:
${groundedFacts}

MOTION:
${motionText}

STYLE:
- Ultra realistic
- Natural lighting
- Professional commercial cinematography
- No fantasy
- No exaggeration

CAMERA:
- Smooth motion
- Stable framing
- Product always in focus

OUTPUT:
High-quality cinematic product commercial video.
`.trim();

    /* ----------------------------------
     * PHASE 4 — SELF-REFINEMENT LOOP
     * ---------------------------------- */
    for (let i = 0; i < max_refine_loop; i++) {
      const refinePrompt = `
You are a Veo prompt auditor.

CHECK THIS PROMPT:
${veoPrompt}

RULES:
- Remove any hallucinated detail
- Remove ambiguity
- Ensure product remains central focus
- Ensure prompt is safe for text-to-video
- Do NOT add new objects or people
- Improve clarity & precision ONLY

Return the improved prompt text only.
`;

      const refineRes = await ai.models.generateContent({
        model: MODELS.VISION,
        contents: [{ text: refinePrompt }],
        config: { temperature: 0.25 },
      });

      veoPrompt = refineRes.text?.trim() || veoPrompt;
    }

    /* ----------------------------------
     * FINAL OUTPUT
     * ---------------------------------- */
    return {
      veo_prompt: veoPrompt,
      negative_prompt: `
cartoon, illustration, CGI, anime, fantasy,
extra limbs, deformed product, blurry,
logo distortion, incorrect proportions,
text overlay, watermark
`.trim(),

      camera_motion: motionText.includes("camera")
          ? motionText
          : "Static or slow cinematic camera movement",

      subject_motion: motionText.includes("movement")
          ? motionText
          : "Minimal natural movement",

      scene_continuity_notes: `
This prompt is visually locked to the analyzed image.
Maintain consistent product appearance, lighting, and scale across scenes.
`.trim(),
    };
  },

  /**
   * Menghasilkan video menggunakan Veo 3.1.
   */
  generateVideoVeo31: async (image_base64: string, prompt_text: string, aspect_ratio: string, characters: Character[] = [], resolution="720p") => {
    const current_key = getEffectiveApiKey();
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });

    let mimeType = getMimeTypeFromBase64(image_base64);
    if (!mimeType.startsWith('image/')) {
      throw new Error("Tipe data gambar tidak dikenali atau tidak valid.");
    }

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

    const final_enhanced_prompt = `${prompt_text}\n\n${audio_directives}`;

    try {
      let operation = await ai.models.generateVideos({
        model: MODELS.VIDEO,
        prompt: final_enhanced_prompt,
        image: { imageBytes: cleanBase64, mimeType: 'image/png' },
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
    } catch (e: any) {
      throw new Error(translateGeminiError(e));
    }
  },



  /**
   * Generate IMAGE → VIDEO with Veo 3.1 (AUDIO ALLOWED)
   * Image is treated as FIRST FRAME (visual lock)
   */
//   generateVideoVeo31: async (
//       api_key: string = "",
//       image_base64: string,
//       prompt_text: string,
//       aspect_ratio: string,
//   ): Promise<Blob> => {
//
//     const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
//
//     const mimeType = getMimeTypeFromBase64(image_base64);
//     if (!mimeType.startsWith("image/")) {
//       throw new Error("Invalid image input for Veo 3.1");
//     }
//
//     const cleanBase64 = image_base64.includes(",")
//         ? image_base64.split(",")[1]
//         : image_base64;
//
//     const audio_directives = `
// [AUDIO — LANGUAGE LOCK]
// Language: Bahasa Indonesia (id-ID)
// DO NOT translate.
// DO NOT paraphrase.
//
// Delivery:
// - Natural Indonesian tone
// - Conversational
// - Commercial style
// `;
//
//     const final_prompt = `
// ${prompt_text}
//
// VISUAL CONTINUITY RULES:
// - The provided image is the FIRST FRAME.
// - Preserve product shape, label, proportions.
// - No redesign or distortion.
//
// CAMERA:
// - Smooth cinematic motion
// - Product remains in focus
//
// ${audio_directives}
// `.trim();
//
//     try {
//       let operation = await ai.models.generateVideos({
//         model: MODEL_VIDEOS["veo-3.1"], // veo-3.1-generate-preview
//         prompt: final_prompt,
//         image: {
//           imageBytes: cleanBase64,
//           mimeType
//         },
//         config: {
//           numberOfVideos: 1,
//           resolution: "720p",
//           aspectRatio: aspect_ratio as any
//         }
//       });
//
//       while (!operation.done) {
//         await new Promise(r => setTimeout(r, 8000));
//         operation = await ai.operations.getVideosOperation({ operation });
//       }
//
//       const rai = (operation.response as any)?.raiMediaFilteredReasons;
//       if (Array.isArray(rai) && rai.length) {
//         throw new Error(`RAI Filter: ${rai.join(", ")}`);
//       }
//
//       const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
//       if (!uri) throw new Error("Video URI not found.");
//
//       const res = await fetch(`${uri}&key=${getEffectiveApiKey()}`);
//       if (!res.ok) throw new Error("Failed to download Veo 3.1 video.");
//
//       return await res.blob();
//
//     } catch (e: any) {
//       throw new Error(translateGeminiError(e, "generateVideoVeo31"));
//     }
//   },
//

  /**
   * AI-based sanitizer for Veo 3.0 Fast
   * Cleans audio intent + enforces safety & RAI compliance
   */
  sanitizePromptForVeo30: async (
      rawPrompt: string
  ): Promise<string> => {
    const ai = new GoogleGenAI({
      apiKey: getEffectiveApiKey(),
    });

    const instruction = `
INSTRUCTION:
You are a strict prompt sanitizer for Veo 3.0 Fast video generation.

Rewrite the prompt so that it is:
- 100% visual-only
- Fully compliant with Responsible AI and safety rules

MANDATORY RULES:

1. AUDIO & SPEECH:
- Remove or rewrite any speech-related intent.
- No talking, explaining, narration, voice, dialogue, live streaming, or interaction.
- Communication must be visual-only (gestures, facial expressions, body language).

2. CHILD SAFETY:
- If children or babies appear:
  - Remove sensual, intimate, or body-focused language.
  - Keep interactions neutral, respectful, and family-safe.

3. SEXUAL / SUGGESTIVE CONTENT:
- Remove sensual, intimate, or erotic descriptions.
- Maintain wholesome, respectful tone.

4. VIOLENCE / HARM:
- Remove any depiction of violence, injury, fear, or threat.

5. ILLEGAL / DANGEROUS ACTIVITIES:
- Remove references to drugs, alcohol abuse, weapons, or illegal acts.

6. MEDICAL / HEALTH CLAIMS:
- Remove absolute or misleading medical claims.

GENERAL CONSTRAINTS:
- Preserve original visual intent and structure.
- Do NOT add new story elements.
- Do NOT mention policies or moderation.
- Output ONLY the sanitized prompt text.

---

ORIGINAL PROMPT:
${rawPrompt}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          parts: [{ text: instruction }],
        },
      ],
      config: {
        temperature: 0.15,
        maxOutputTokens: 2048,
      },
    });

    const cleaned =
        response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!cleaned) {
      throw new Error("Sanitasi prompt Veo 3.0 gagal.");
    }

    return cleaned.trim();
  },
  /**
   * Prompt sanitizer for Veo 3.1
   * - Preserves original intent and structure
   * - Allows audio, speech, narration
   * - Enforces RAI & child safety
   */
  sanitizePromptForVeo31 : async (
      rawPrompt: string
  ): Promise<string> => {
    const ai = new GoogleGenAI({
      apiKey: getEffectiveApiKey(),
    });

    const instruction = `
INSTRUCTION:
You are a prompt normalizer and safety enforcer for Veo 3.1 video generation.

GOALS:
- Preserve the original story, structure, and intent.
- Audio, speech, dialogue, and narration are ALLOWED.
- Rewrite only when needed for clarity, safety, or compliance.

SAFETY RULES:

1. AUDIO & SPEECH:
- Spoken dialogue and narration are allowed.
- Remove conflicting instructions (e.g., "silent" + "speaking").

2. CHILD SAFETY:
- All interactions involving children must be respectful, non-sexual, and appropriate.
- Avoid detailed body-focused descriptions.

3. SEXUAL / SUGGESTIVE CONTENT:
- Remove or soften erotic or sensual phrasing.

4. VIOLENCE / HARM:
- Remove graphic violence or threats.

5. ILLEGAL / DANGEROUS ACTIVITIES:
- Remove references to drugs, alcohol abuse, weapons, or illegal acts.

6. MEDICAL / HEALTH CLAIMS:
- Avoid absolute or misleading medical claims.

GENERAL CONSTRAINTS:
- Do NOT remove scenes unless strictly necessary.
- Do NOT add new story elements.
- Do NOT mention safety rules or policies.
- Output ONLY the sanitized prompt text.

---

ORIGINAL PROMPT:
${rawPrompt}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          parts: [{ text: instruction }],
        },
      ],
      config: {
        temperature: 0.25,
        maxOutputTokens: 3072,
      },
    });

    const sanitized =
        response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!sanitized) {
      throw new Error("Sanitasi prompt Veo 3.1 gagal.");
    }

    return sanitized.trim();
  },


  /**
   * Menghasilkan video menggunakan Veo 3.0 Fast (TEXT → VIDEO).
   * Output: SILENT CINEMATIC VIDEO (no audio, no speech)
   */
  generateVideoVeo30: async (
      describe_scene_prompt : string,
      prompt_text: string,
      aspect_ratio: string,
      Characters: Character[] = [],
      product_json: any = {}
  ): Promise<Blob> => {
    const current_key = getEffectiveApiKey();
    console.log(
        "[GeminiService] Using API Key Prefix:",
        current_key ? current_key.slice(0, 8) + "..." : "No Key"
    );

    const ai = new GoogleGenAI({ apiKey: current_key });

    let character_prompt = `Character Details:`;

    for (const character of Characters) {
      character_prompt += `
- Name: ${character.name} 
    Description: ${character.description} , With Detail : ${character.prompt}
`;
    }

    let product_prompt = `Product Details:
- Name: ${product_json.name || "N/A"}
- SKU: ${product_json.sku || "N/A"}
- Description: ${product_json.description || "N/A"}
- Dimensions: ${product_json.dimension || "N/A"}
`;

    const scene_description = `
    ${character_prompt}

${product_prompt}

[SCENE VISUAL DESCRIPTION]
${describe_scene_prompt}

Photography Style:
Photography Style: 85mm f/1.4 lens, 8K resolution, cinematic color grading, sharp focus on subject
`;

    const prompt_with_scene = `
${scene_description}

${prompt_text}
`;

    /**
     * ⚠️ VISUAL-ONLY DIRECTIVES (AMAN UNTUK VEO)0
     */
    const visual_directives = `
[VISUAL CINEMATIC DIRECTIVES]
- Silent cinematic video (NO audio, NO dialogue, NO speech)
- Storytelling through facial expressions and body language only
- Natural lighting, realistic motion, smooth camera movement
- Cinematic composition, shallow depth of field, film-like quality
- Emotion conveyed visually, without text or sound
`;

    const final_prompt = `
${prompt_with_scene}

${visual_directives}
`;

    // Bersihkan prompt untuk Veo 3.0 Fast
    const sanitized_prompt = await aiService.sanitizePromptForVeo30(final_prompt);

    try {
      // 🎬 TEXT → VIDEO (VALID UNTUK veo-3.0-fast-generate-001)
      let operation = await ai.models.generateVideos({
        model: "veo-3.0-fast-generate-001",
        prompt: sanitized_prompt,
        config: {
          numberOfVideos: 1,
          resolution: "720p",
          aspectRatio: aspect_ratio as any,
        },
      });

      // ⏳ Polling long-running operation
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      // 🚨 Safety filter check
      const rai_reasons =
          (operation.response as any)?.raiMediaFilteredReasons;

      if (Array.isArray(rai_reasons) && rai_reasons.length > 0) {
        throw new Error(
            `RAI Filter Aktif: ${rai_reasons.join(". ")}`
        );
      }

      // 📥 Download video
      const download_link =
          operation.response?.generatedVideos?.[0]?.video?.uri;

      if (!download_link) {
        throw new Error("Link unduhan video tidak ditemukan.");
      }

      const response = await fetch(`${download_link}&key=${current_key}`);
      if (!response.ok) {
        throw new Error("Gagal mengunduh video hasil sintesis.");
      }

      return await response.blob();
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "generateVideoVeo3.0"));
    }
  },

  /**
   * Generate video WITH AUDIO using Veo 3.0
   * Visual is LOCKED from analyzeSceneForVeo
   * Audio is LOCKED from analyzeFirstSceneImage
   */
  generateVideoVeo30WithAudio: async (
      veo_analysis: {
        veo_prompt: string;
        negative_prompt: string;
        camera_motion: string;
        subject_motion: string;
        scene_continuity_notes: string;
      },
      voice_analysis: {
        voice_over_text: string;
        voice_name: string;
        speaking_rate: number;
        pause_hint: string;
      },
      aspect_ratio: string
  ): Promise<Blob> => {

    const current_key = getEffectiveApiKey();
    const ai = new GoogleGenAI({ apiKey: current_key });

    /* ----------------------------------
     * AUDIO DIRECTIVES (LOCKED)
     * ---------------------------------- */
    const audio_directives = `
[AUDIO — STRICTLY FOLLOW]
Voice-over Text (DO NOT CHANGE WORDING):
"${voice_analysis.voice_over_text}"

Voice:
- voice_name: ${voice_analysis.voice_name}
- speaking_rate: ${voice_analysis.speaking_rate}
- pause_hint: ${voice_analysis.pause_hint}

Rules:
- Natural Indonesian delivery
- No robotic tone
- No extra dialogue
- No additional narration
`;

    /* ----------------------------------
     * FINAL VEO PROMPT (CLEAN)
     * ---------------------------------- */
    const final_prompt = `
${veo_analysis.veo_prompt}

CAMERA MOTION:
${veo_analysis.camera_motion}

SUBJECT MOTION:
${veo_analysis.subject_motion}

CONTINUITY:
${veo_analysis.scene_continuity_notes}

NEGATIVE PROMPT:
${veo_analysis.negative_prompt}

Photography Style:
Photography Style: 85mm f/1.4 lens, 8K resolution, cinematic color grading, sharp focus on subject

${audio_directives}
`.trim();

    // 🔒 SANITIZE (Veo safety)
    const sanitized_prompt =
        await aiService.sanitizePromptForVeo31(final_prompt);

    try {
      let operation = await ai.models.generateVideos({
        model: "veo-3.0-generate-001",
        prompt: sanitized_prompt,
        config: {
          numberOfVideos: 1,
          resolution: "720p",
          aspectRatio: aspect_ratio as any,
        },
      });

      while (!operation.done) {
        await new Promise((r) => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const rai =
          (operation.response as any)?.raiMediaFilteredReasons;

      if (Array.isArray(rai) && rai.length) {
        throw new Error(`RAI Filter: ${rai.join(", ")}`);
      }

      const videoUri =
          operation.response?.generatedVideos?.[0]?.video?.uri;

      if (!videoUri) {
        throw new Error("Video URI tidak ditemukan.");
      }

      const res = await fetch(`${videoUri}&key=${current_key}`);
      if (!res.ok) {
        throw new Error("Gagal download video.");
      }

      return await res.blob();

    } catch (e: any) {
      throw new Error(
          translateGeminiError(e, "generateVideoVeo30WithAudio")
      );
    }
  },

  /**
   * Generate IMAGE → VIDEO using Veo 3.0 Fast Preview
   * Model: veo-3.0-fast-generate-preview
   * Image is used as the FIRST FRAME (seed), not reference lock
   */
  generateVideoVeo30FastPreviewImageToVideo: async (
      image_base64: string,
      prompt_text: string,
      aspect_ratio: string
  ): Promise<Blob> => {

    const apiKey = getEffectiveApiKey();
    const ai = new GoogleGenAI({ apiKey });

    let mimeType = getMimeTypeFromBase64(image_base64);
    if (!mimeType.startsWith("image/")) {
      throw new Error("Invalid image input for Veo 3.0 preview.");
    }

    // IMPORTANT: Veo expects RAW base64 (no data:image/... prefix)
    const cleanBase64 = image_base64.includes(",")
        ? image_base64.split(",")[1]
        : image_base64;

    const final_prompt = `
IMAGE-TO-VIDEO PREVIEW.

RULES:
- The provided image is the FIRST FRAME of the video.
- Preserve overall appearance, composition, and subject placement.
- Natural motion only.
- No drastic changes to product shape, label, or characters.
- Stable lighting and color.

SCENE DESCRIPTION:
${prompt_text}

STYLE:
- Realistic
- Commercial video
- No fantasy
- No exaggeration
`.trim();

    try {
      let operation = await ai.models.generateVideos({
        model: MODEL_VIDEOS["veo-3.0-preview"], // veo-3.0-fast-generate-preview
        prompt: final_prompt,
        image: {
          imageBytes: cleanBase64,
          mimeType: mimeType,
        },
        config: {
          numberOfVideos: 1,
          resolution: "720p",
          aspectRatio: aspect_ratio as any,
        },
      });

      // Polling
      while (!operation.done) {
        await new Promise((r) => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const rai =
          (operation.response as any)?.raiMediaFilteredReasons;

      if (Array.isArray(rai) && rai.length > 0) {
        throw new Error(`RAI Filter Active: ${rai.join(", ")}`);
      }

      const videoUri =
          operation.response?.generatedVideos?.[0]?.video?.uri;

      if (!videoUri) {
        throw new Error("Veo 3.0 Preview: Video URI not found.");
      }

      const res = await fetch(`${videoUri}&key=${apiKey}`);
      if (!res.ok) {
        throw new Error("Failed to download Veo 3.0 preview video.");
      }

      return await res.blob();

    } catch (e: any) {
      throw new Error(
          translateGeminiError(e, "generateVideoVeo30FastPreviewImageToVideo")
      );
    }
  },



  /**
   * Generate TTS audio from image analysis result.
   * Output: Raw PCM (LINEAR16) - lipsync friendly (decoded from Base64)
   */
  generateTTSFromAnalysis: async (analysis: {
    voice_over_text: string;
    voice_name: string;
    speaking_rate: number;
    pause_hint: "short" | "medium" | "long";
    gender_voice: string,
  }): Promise<Blob>  => {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });

    // Guide the model with explicit prosody cues in the prompt
    const prosody_instruction = `Say the following text clearly. 
    Speaking rate: ${analysis.speaking_rate}x (1.0 is normal). 
    Pacing: Use ${analysis.pause_hint} pauses between sentences and phrases.
    Voice Gender: ${analysis.gender_voice}.
    Tone: Professional commercial narrator.`;

    const full_prompt = `${prosody_instruction}\n\nText: ${analysis.voice_over_text}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: full_prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: normalizeVoiceName(analysis.voice_name)
              },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("Gagal menghasilkan audio TTS: Respons kosong.");
      }

      // Manual Base64 to Uint8Array conversion (LINEAR16 PCM bytes)
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return new Blob(
          [bytes.buffer],
          { type: "audio/L16;codec=pcm;rate=24000" }
      );
    } catch (e: any) {
      throw new Error(translateGeminiError(e, "generateTTSFromAnalysis"));
    }
  }
};
