import axios from "axios";
import { Character, StoryboardJSON } from "../types";

export const geminiApiService = {
    async generateImageToVideo(
        api_key: string,
        image_base64: string,
        prompt_text: string,
        aspect_ratio: string,
        characters: Character[] = [],
        resolution = "720p",
        storyboard?: StoryboardJSON,
    ): Promise<Blob> {

        const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
        const MODEL = "models/veo-3.1-fast-generate-preview";

        try {
            const cleanBase64 = image_base64.includes(",")
                ? image_base64.split(",")[1]
                : image_base64;

            const audio_directives = `
            [AUDIO CHARACTERISTICS & VOCAL DESIGN]
            - Vocal Realism: High-fidelity natural human speech, relaxed (santai) and authentic tone.
            - Sound Cues: Include subtle human-like filler words, natural pauses, and organic breaths between sentences.
            - Acoustics: Sound environment must resonate naturally with the setting.
            - Unique Voice Profiles:
            ${characters.map(c => `  * ${c.name} (${c.gender}): Voice should be distinct and characteristic of their persona.`).join('\n')}
            - Strictly avoid robotic or flat monotonous AI-generated voices. Use dynamic intonation.
            `;

            const finalPrompt = `
            NARRATIVE: ${storyboard?.description || prompt_text}
            SCENE: ${prompt_text}
            \n ${audio_directives}
            `.trim();

            // ==============================
            // 1️⃣ CREATE LONG RUNNING TASK
            // ==============================
            const createRes = await axios.post(
                `${BASE_URL}/${MODEL}:predictLongRunning`,
                {
                    instances: [
                        {
                            prompt: finalPrompt,
                            image: {
                                bytesBase64Encoded: cleanBase64,
                                mimeType: "image/png"
                            }
                        }
                    ],
                    parameters: {
                        sampleCount: 1,
                        aspectRatio: aspect_ratio,
                        resolution: resolution
                    }
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": api_key
                    }
                }
            );

            const operationName = createRes.data?.name;

            if (!operationName) {
                throw new Error("Failed to create video operation.");
            }

            // ==============================
            // 2️⃣ POLLING LOOP
            // ==============================
            let operation;
            let attempts = 0;
            const maxAttempts = 15;

            while (attempts < maxAttempts) {

                const delay = attempts === 0 ? 60000 : 120000; // 1 menit pertama, lalu 2 menit
                console.log(`[Polling] Attempt ${attempts + 1}, delay ${delay / 1000}s`);

                await new Promise(r => setTimeout(r, delay));
                attempts++;

                const pollRes = await axios.get(
                    `${BASE_URL}/${operationName}`,
                    {
                        headers: { "x-goog-api-key": api_key }
                    }
                );

                operation = pollRes.data;

                if (operation.done) break;
            }


            if (!operation?.done) {
                throw new Error("Video generation timeout.");
            }

            if (operation.error) {
                throw new Error(operation.error.message);
            }

            // ==============================
            // 3️⃣ EXTRACT VIDEO URI
            // ==============================
            const uri =
                operation.response
                    ?.generateVideoResponse
                    ?.generatedSamples?.[0]
                    ?.video?.uri;

            if (!uri) {
                throw new Error("Video URI not found.");
            }

            // ==============================
            // 4️⃣ DOWNLOAD VIDEO
            // ==============================
            const downloadRes = await axios.get(uri, {
                headers: { "x-goog-api-key": api_key },
                responseType: "blob"
            });

            return downloadRes.data;

        } catch (e: any) {
            const msg =
                e.response?.data?.error?.message ||
                e.message ||
                "Unknown Veo 3.1 Fast error";

            console.error("[Veo 3.1 FAST ERROR]", msg);
            throw new Error(msg);
        }
    }
};
