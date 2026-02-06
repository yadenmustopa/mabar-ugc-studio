
import { GoogleGenAI } from "@google/genai";
import { MODELS } from "../constants";

export const ai_service = {
  generate_video_asset: async (image_base64, storyboard_desc, aspect_ratio) => {
    console.log("[Gemini] Starting Video synthesis with model:", MODELS.VIDEO);
    
    // Inisialisasi instance baru untuk memastikan menggunakan Key terbaru dari proses.env
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
      let operation = await ai.models.generateVideos({
        model: MODELS.VIDEO,
        prompt: storyboard_desc,
        image: {
          imageBytes: image_base64,
          mimeType: 'image/png',
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspect_ratio
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        try {
          operation = await ai.operations.getVideosOperation({ operation });
        } catch (poll_error) {
          // Tangani "Requested entity was not found"
          if (poll_error.message?.includes("not found") || poll_error.status === "NOT_FOUND") {
            console.error("[Gemini] Entity not found during polling. Project mismatch or billing issue.");
            throw new Error("KEY_RESET_REQUIRED");
          }
          throw poll_error;
        }
      }

      const download_uri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!download_uri) throw new Error("Synthesis completed but no URI found.");

      const response = await fetch(`${download_uri}&key=${process.env.API_KEY}`);
      if (!response.ok) throw new Error("Failed to fetch video bytes");
      
      return await response.blob();
    } catch (error) {
      if (error.message === "KEY_RESET_REQUIRED") throw error;
      
      // Jika error awal adalah 404
      if (error.message?.includes("not found")) {
        throw new Error("KEY_RESET_REQUIRED");
      }
      
      console.error("[Gemini] Video Generation Error:", error);
      throw error;
    }
  },

  generate_storyboard: async (payload) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Create video storyboard for: ${payload.prompt}. Product: ${payload.product_name}`;
    
    const response = await ai.models.generateContent({
      model: MODELS.STORYBOARD,
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 2000 }
      }
    });
    
    return JSON.parse(response.text);
  }
};
