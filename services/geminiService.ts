
import { GoogleGenAI, Type } from "@google/genai";
import { MODELS, TARGET_CONTENT } from "../constants";
import { StoryboardJSON, StoryboardScene, Character } from "../types";

const getEffectiveApiKey = (): string => {
  return process.env.API_KEY || '';
};

const translateGeminiError = (error: any): string => {
  const message = error.message || "";
  if (message.includes("raiMediaFilteredReasons")) return message;
  if (message.includes("photorealistic children")) return "Kebijakan Keamanan: Tidak diizinkan membuat video anak-anak secara realistis.";
  if (message.includes("Requested entity was not found") || message.includes("404")) return "Project Google Cloud Anda tidak memiliki akses ke model ini.";
  if (message.includes("billing") || message.includes("403")) return "Masalah Penagihan: Periksa status Billing di Console.";
  return message || "Terjadi kesalahan internal pada layanan AI.";
};

export const aiService = {
  /**
   * Menghasilkan potongan storyboard JSON menggunakan Structured Output.
   * Lokalisasi otomatis berdasarkan TARGET_CONTENT.
   * Dilengkapi dengan retry logic dan skema yang sangat ketat.
   */
  generateStoryboardChunk: async (data: any, existing_scenes: StoryboardScene[] = [], retryCount = 0): Promise<StoryboardJSON> => {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const MAX_RETRIES = 2;
    
    const context_scenes = existing_scenes.length > 0 
      ? `Lanjutkan cerita secara logis dari adegan terakhir. Total adegan sebelumnya: ${existing_scenes.length}.` 
      : "Ini adalah awal video.";

    const prompt = `Bertindaklah sebagai sutradara iklan kelas dunia. Buat storyboard video UGC (User Generated Content) premium.
    
    TARGET AUDIENCE & LANGUAGE: ${TARGET_CONTENT.toUpperCase()} (Wajib menggunakan Bahasa Indonesia yang natural, kekinian, santai, dan relatable).
    
    ATURAN KETAT:
    1. Jaga deskripsi tetap singkat dan bermakna. 
    2. Hindari pengulangan kata yang tidak perlu (REPETITION). 
    3. Fokus pada penceritaan yang emosional namun informatif tentang produk.
    4. Ketika khusus anak-anak maka , samarkan bentuk dan muka anak-anak, jangan terlihat anak-anak
    
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
          temperature: 0.7, // Lebih deterministik untuk mencegah looping teks
          topP: 0.9,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING, description: "Overview singkat konsep video" },
              production_notes: { type: Type.STRING, description: "Catatan teknis produksi" },
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
                  required: ["scene_number", "duration", "actions", "setting", "elements"]
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
      
      // Sanitasi response blok markdown jika ada
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      }
      
      try {
        const parsed = JSON.parse(jsonStr);
        return parsed as StoryboardJSON;
      } catch (parseError: any) {
        console.error(`[GeminiService] JSON Parse Error (Attempt ${retryCount + 1}):`, parseError.message);
        
        if (retryCount < MAX_RETRIES) {
          // Rekursif retry jika gagal parse
          return await aiService.generateStoryboardChunk(data, existing_scenes, retryCount + 1);
        }
        throw new Error(`Gagal memproses struktur storyboard setelah ${MAX_RETRIES} percobaan: ${parseError.message}`);
      }
    } catch (e: any) {
      console.error("[GeminiService] Storyboard Critical Error:", e);
      throw new Error(translateGeminiError(e));
    }
  },

  /**
   * Menghasilkan gambar adegan dengan referensi visual produk & karakter (Highlight Consistency).
   * Mendukung multiple characters secara fleksibel dengan labeling metadata.
   */
  generateFirstSceneImage: async (
    storyboard_chunk: StoryboardJSON, 
    product_b64: string | null,
    characters: Array<Character & { b64: string }>,
    aspect_ratio: string
  ) => {
    const ai = new GoogleGenAI({ apiKey: getEffectiveApiKey() });
    const first_scene = storyboard_chunk.scenes?.[0];

    // Build Character Metadata prompt mapping
    const char_details = characters.map((c, idx) => {
      const label = `@char${(idx + 1).toString().padStart(2, '0')}`;
      return `${label}: Name: ${c.name}, Gender: ${c.gender}, Details: ${c.description}`;
    }).join(" | ");

    const char_mentions = characters.map((_, idx) => `@char${(idx + 1).toString().padStart(2, '0')}`).join(", ");

    const prompt_text = `
    A highly detailed photorealistic portrait of a [gender] [ethnicity], [age] years old, The subject has [specific skin texture details like pores, 
    fine lines, subtle blemishes], [detailed eye description including iris patterns, 
    catchlights, and natural moisture], 
    [hair texture and individual strands visible]. 
    Natural lighting from [direction and quality], 
    showing realistic subsurface scattering on the skin.
    [Specific expression] with micro-expressions visible. 
    Shot at golden hour with soft natural shadows. 
    8K resolution, unretouched photography style,
    A high-end photorealistic commercial photography. 
    TASK: Generate this scene ensuring the PRODUCT and ALL listed CHARACTERS match the provided visual references.

    SCENE ACTION: ${first_scene?.actions.join(", ")}. 
    SETTING: ${first_scene?.setting}. 
    LIGHTING: ${first_scene?.lighting}.
    
    CHARACTER REFERENCE MAPPING:
    ${char_details}
    
    STRICT REQUIREMENT: 
    1. The product from the first image part must be the HERO, clearly visible and sharp. 
    2. ALL characters listed (${char_mentions}) MUST be visible together in the same frame for this scene. 
    3. Maintain 100% facial and clothing consistency for each character based on their respective image parts.
    4. Composition: Ensure all actors are interacting naturally according to the action.
    5. You can improve or change the clothing character
    6. When there are children in the photo, blur their faces and figures.
    7. Analyze the shape and size of the product image, ensure that the product image matches the product image I uploaded, avoid color differences, avoid shape differences.
    
    Photography style: 85mm f/1.4 lens, 8K resolution, natural skin texture, cinematic color grading. NO TEXT, NO LOGOS.`;

    console.log(`[GeminiService] Generating Image with ${characters.length} characters and prompt:`, prompt_text);

    const parts: any[] = [];
    // Part 1: Product
    if (product_b64) {
      parts.push({ inlineData: { data: product_b64, mimeType: 'image/png' } });
    }
    
    // Part 2..N: Characters
    characters.forEach((char, idx) => {
      console.log(`[GeminiService] Adding Character Part ${idx + 1}: ${char.name}`);
      parts.push({ inlineData: { data: char.b64, mimeType: 'image/png' } });
    });

    // Final Part: Instruction
    parts.push({ text: prompt_text });

    try {
      const response = await ai.models.generateContent({
        model: MODELS.IMAGE,
        contents: { parts },
        config: { 
          imageConfig: { aspectRatio: aspect_ratio as any } 
        }
      });

      let base64 = '';
      const responseParts = response.candidates?.[0]?.content?.parts || [];
      for (const part of responseParts) {
        if (part.inlineData) {
          base64 = part.inlineData.data;
          break;
        }
      }

      if (!base64) throw new Error("Gagal mensintesis gambar (Respons Kosong).");
      return base64;
    } catch (e: any) {
      console.error("[GeminiService] Image Gen Error:", e);
      throw new Error(translateGeminiError(e));
    }
  },

  /**
   * Menghasilkan video menggunakan Veo 3.1.
   */
  generateVideoVeo: async (image_base64: string, prompt_text: string, aspect_ratio: string) => {
    const current_key = getEffectiveApiKey();
    const ai = new GoogleGenAI({ apiKey: current_key });
    
    try {
      let operation = await ai.models.generateVideos({
        model: MODELS.VIDEO,
        prompt: prompt_text,
        image: { imageBytes: image_base64, mimeType: 'image/png' },
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: aspect_ratio as any }
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
      console.error("[GeminiService] Video Gen Error:", e);
      throw new Error(translateGeminiError(e));
    }
  }
};
