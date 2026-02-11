import React, {useEffect, useState, useRef} from 'react';
import {mabarApi} from '../services/mabarService';
import {aiService} from '../services/geminiService';
import {Character, GenerationItem, ObjectStorage, Product, TaskStatus} from '../types';
import {base64ToBlob, getMimeTypeFromBase64, pcmToWav, showToast, urlToBase64} from '../utils';
import {
    API_BASE_URL,
    ASPECT_RATIOS,
    AVG_DURATION_PER_VIDEO, BASE_URL_MABAR,
    DEFAULT_MIN_DURATION,
    MODEL_VIDEOS,
    RESOLUTIONS,
    URL_UPLOAD_ASSET
} from '../constants';
import {captureLastFrameFromVideoBlob} from "@/services/frameService";
import Select2Async from "@/components/Select2Async";

const GenerateContent: React.FC = () => {
    const [products_list, set_products_list] = useState<Product[]>([]);
    const [characters_list, set_characters_list] = useState<Character[]>([]);
    const [storages_list, set_storages_list] = useState<ObjectStorage[]>([]);
    const [available_buckets, set_available_buckets] = useState<string[]>([]);
    const [generations_list, set_generations_list] = useState<GenerationItem[]>([]);
    const [is_generating, setIs_generating] = useState(false);
    const [api_key, set_api_key] = useState<string>('');

    const [form_data, set_form_data] = useState({
        name: '',
        product_id: '',
        character_ids: [] as number[],
        prompt: '',
        negative_prompt: '',
        amount: 1,
        resolution: '1080p',
        aspect_ratio: '9:16',
        min_duration: DEFAULT_MIN_DURATION,
        object_storage_id: '',
        bucket: '',
        model_video: MODEL_VIDEOS["veo-3.1"],
        gemini_api_key_id: null,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [p, c, s] = await Promise.all([
                    mabarApi.getProducts(),
                    mabarApi.getCharacters(),
                    mabarApi.getObjectStorages()
                ]);
                set_products_list(p);
                set_characters_list(c);
                set_storages_list(s);
                if (s.length > 0) {
                    const first_storage = s[0];
                    const buckets = first_storage.buckets.split(',').map(b => b.trim());
                    set_available_buckets(buckets);
                    set_form_data(prev => ({
                        ...prev,
                        object_storage_id: first_storage.object_storage_id.toString(),
                        bucket: buckets[0]
                    }));
                }
            } catch (err: any) {
                const error_message = err.response?.data?.message || "Gagal sinkronisasi aset";
                showToast(error_message, "error");
            }
        };
        fetchData();
    }, []);

    const handleStorageChange = (storage_id: string) => {
        const storage = storages_list.find(s => s.object_storage_id.toString() === storage_id);
        if (storage) {
            const buckets = storage.buckets.split(',').map(b => b.trim());
            set_available_buckets(buckets);
            set_form_data(prev => ({
                ...prev,
                object_storage_id: storage_id,
                bucket: buckets[0]
            }));
        }
    };

    const startProduction = async () => {
        // Validasi input per section agar jelas pesan errornya bagi user
        if (!form_data.name.trim()) {
            showToast("Judul wajib diisi", "warning");
            return;
        }
        if (!form_data.product_id) {
            showToast("Pilih Produk yang akan dipromosikan", "warning");
            return;
        }
        if (form_data.character_ids.length === 0) {
            showToast("Pilih minimal satu Karakter untuk video", "warning");
            return;
        }
        if (!form_data.prompt.trim()) {
            showToast("Brief Content / Prompt wajib diisi", "warning");
            return;
        }
        if (!form_data.object_storage_id || !form_data.bucket) {
            showToast("Pilih Storage Server dan Bucket untuk output", "warning");
            return;
        }
        // if(!form_data.model_video === MODEL_VIDEOS["veo-3.1"]){
        //     if(!form_data.gemini_api_key_id){
        //         showToast("Pilih API Key Gemini untuk model VEO 3.1", "warning");
        //     }
        // }

        setIs_generating(true);
        let global_ugc_id: string | number | null = null;

        try {
            const machine_id = localStorage.getItem('machine_id') || 'STUDIO_01';

            const ugc_payload = {
                name: form_data.name,
                machine_id: machine_id,
                product_id: form_data.product_id,
                characters: form_data.character_ids,
                prompt: form_data.prompt,
                negative_prompt: form_data.negative_prompt,
                amount: form_data.amount,
                resolution: form_data.resolution,
                aspect_ratio: form_data.aspect_ratio,
                min_duration: form_data.min_duration,
                object_storage_id: form_data.object_storage_id,
                bucket: form_data.bucket,
                model_video : form_data.model_video,
                gemini_api_key_id: form_data.gemini_api_key_id,
            };

            const ugc_response = await mabarApi.initUGC(ugc_payload);
            global_ugc_id = ugc_response.id;
            set_form_data({...form_data, name: ugc_response.name}); // Injek nama final dari response

            const target_product = products_list.find(p => p.id.toString() === form_data.product_id)!;
            const target_chars = characters_list.filter(c => form_data.character_ids.includes(c.id));
            // const target_storage = storages_list.find(s => s.object_storage_id.toString() === form_data.object_storage_id)!;

            showToast("Mempersiapkan referensi visual...", "info");
            const product_img_url = target_product.product_reference_image_path
                ? `${URL_UPLOAD_ASSET}/${target_product.product_reference_image_path.replace(/^\//, '')}`
                : target_product.image_url;

            const product_b64 = await urlToBase64(product_img_url);

            console.log("[StartProduction] Product base64 prepared : ", product_b64.substring(0, 30) + "...");

            // IMPROVEMENT: Prepare character assets with full metadata and base64
            const target_chars_with_b64 = await Promise.all(target_chars.map(async c => {
                const url = c.character_image_path
                    ? `${URL_UPLOAD_ASSET}/${c.character_image_path.replace(/^\//, '')}`
                    : (c.image_url || '');
                const b64 = await urlToBase64(url);
                return { ...c, b64 };
            }));

            let have_completed_once = false;
            for (let i = 0; i < form_data.amount; i++) {
                const ugc_item = ugc_response.items?.[i];
                if (!ugc_item) continue;
                const ugc_item_id = ugc_item.id;
                const temp_id = `item-${ugc_item_id}`;

                set_generations_list(prev => [{
                    id: temp_id,
                    ugc_id: global_ugc_id!.toString(),
                    order_index: i+1,
                    status: TaskStatus.CREATING_STORYBOARD,
                    progress: 10
                }, ...prev]);

                try {
                    await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.CREATING_STORYBOARD);
                    let storyboard_chunks: any[] = await storyBoardChunk(target_product, target_chars);
                    await mabarApi.setStoryboard(global_ugc_id!, ugc_item_id, storyboard_chunks);


                    await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.GENERATING_FIRST_SCENE_IMAGE);
                    set_generations_list(prev => prev.map(g => g.id === temp_id ? {
                        ...g,
                        status: TaskStatus.GENERATING_FIRST_SCENE_IMAGE,
                        progress: 40
                    } : g));

                    let previous_local_video_url = null;
                    let last_video_blob: Blob | null = null;
                    for (let s_idx = 0; s_idx < storyboard_chunks.length; s_idx++) {
                        let video_blob = null;
                        let voiceover_audio_blob = null;
                        let json_describe = null;

                        if (s_idx === 0) {
                            // generate locked first product image
                            const product_b64_locked = await aiService.generateLockedProductImage(product_b64, form_data.aspect_ratio);

                            let veo_prompt = ``;
                            // concat description + map concat scenes.veo_visual_prompt with identity per scene number , exaple scene {scene_number}: {veo_visual_prompt}
                            veo_prompt += storyboard_chunks[s_idx].description + " ";
                            veo_prompt += storyboard_chunks[s_idx].scenes.map((sc: any) => `Scene ${sc.scene_number}: ${sc.veo_visual_prompt}`).join(" ");

                            // IMPROVEMENT: Pass target_chars_with_b64 for consistency and multiple character support
                            const b64 = await aiService.generateFirstSceneImage(
                                api_key,
                                veo_prompt,
                                form_data.prompt,
                                storyboard_chunks[s_idx],
                                product_b64_locked,
                                target_chars_with_b64,
                                form_data.aspect_ratio
                            );

                            let mimeType = getMimeTypeFromBase64(b64);

                            let blob = base64ToBlob(b64, mimeType);

                            await mabarApi.setFirstSceneImage(global_ugc_id!, ugc_item_id, blob, s_idx + 1);

                            // generate video by scene image
                            await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.GENERATING_VIDEO);
                            set_generations_list(prev => prev.map(g => g.id === temp_id ? {
                                ...g,
                                status: TaskStatus.GENERATING_VIDEO,
                                progress: 70
                            } : g));

                            if (form_data.model_video === MODEL_VIDEOS["veo-3.0-preview"]) {

                                video_blob =
                                    await aiService.generateVideoVeo30FastPreviewImageToVideo(
                                        b64,                 // FIRST SCENE IMAGE
                                        veo_prompt,          // storyboard + scene prompt
                                        form_data.aspect_ratio
                                    );

                            }else if(form_data.model_video === MODEL_VIDEOS["veo-3.1"]){
                                video_blob = await aiService.generateVideoVeo31(api_key, b64, veo_prompt, form_data.aspect_ratio, target_chars, form_data.resolution, storyboard_chunks[s_idx]);
                            }else{
                                // if model_video is veo-3.0
                                // analyze image first scene to describe prompt image

                                // set step analyze scene
                                await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.ANALYZING_SCENE);

                                json_describe = await aiService.analyzeFirstSceneImage(b64, veo_prompt, target_chars, target_product);


                                // set analyze scene to mabar api
                                await mabarApi.setAnalyzeScene(global_ugc_id!, ugc_item_id, JSON.stringify(json_describe));

                                // const describe_image_prompt = json_describe.description_first_image;
                                //
                                // console.log("[StartProduction] VEO Prompt for first scene video:", veo_prompt);

                                const veoAnalysis =
                                    await aiService.analyzeSceneForVeo(
                                        b64,
                                        json_describe.description_first_image
                                    );

                                video_blob = await aiService.generateVideoVeo30WithAudio(veoAnalysis, json_describe, form_data.aspect_ratio);
                            }
                        } else {
                            // get last captured image from previous video
                            // ===== SCENE LANJUTAN =====
                            if (!previous_local_video_url) {
                                throw new Error("Previous video URL not found");
                            }

                            // 🔑 AMBIL LAST FRAME VIDEO SEBELUMNYA
                            const last_b64_image = await captureLastFrameFromVideoBlob(
                                last_video_blob,
                                (p) => {
                                    console.log(`Capturing last frame progress: ${p}%`);
                                },
                                0.12 // epsilon → detik sebelum akhir
                            );

                            let mimeType = getMimeTypeFromBase64(last_b64_image);

                            console.log("[StartProduction] Last frame base64 for next scene:", last_b64_image);

                            let blob = base64ToBlob(last_b64_image, mimeType);

                            console.log("[StartProduction] Last frame blob for next scene:", blob);

                            await mabarApi.setFirstSceneImage(global_ugc_id!, ugc_item_id, blob, s_idx + 1);

                            // generate video by scene image
                            await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.GENERATING_VIDEO);
                            set_generations_list(prev => prev.map(g => g.id === temp_id ? {
                                ...g,
                                status: TaskStatus.GENERATING_VIDEO,
                                progress: 70
                            } : g));

                            const currentScene = storyboard_chunks[s_idx];

                            let veoPrompt = ``;
                            veoPrompt += currentScene.description + " ";
                            veoPrompt += currentScene.scenes.map((sc: any) => `Scene ${sc.scene_number}: ${sc.veo_visual_prompt}`).join(" ");

                            let scene_index = s_idx + 1;
                            console.log("[StartProduction] VEO Prompt for next scene video ke :" + scene_index, veoPrompt);
                            if (form_data.model_video === MODEL_VIDEOS["veo-3.0-preview"]) {

                                video_blob =
                                    await aiService.generateVideoVeo30FastPreviewImageToVideo(
                                        last_b64_image,                 // FIRST SCENE IMAGE
                                        veoPrompt,          // storyboard + scene prompt
                                        form_data.aspect_ratio
                                    );

                            } else if(form_data.model_video === MODEL_VIDEOS["veo-3.1"]) {
                                video_blob = await aiService.generateVideoVeo31(api_key, last_b64_image, veoPrompt, form_data.aspect_ratio, target_chars, form_data.resolution, storyboard_chunks[s_idx]);
                            }else{
                                // set step analyze scene
                                await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.ANALYZING_SCENE);

                                // if model_video is veo-3.0
                                // analyze image first scene to describe prompt image
                                json_describe = await aiService.analyzeFirstSceneImage(last_b64_image, veoPrompt, target_chars, target_product);

                                const veoAnalysis =
                                    await aiService.analyzeSceneForVeo(
                                        last_b64_image,
                                        json_describe.description_first_image
                                    );

                                video_blob = await aiService.generateVideoVeo30WithAudio(veoAnalysis, json_describe, form_data.aspect_ratio);
                                // generate voiceover
                            }
                        }

                        await mabarApi.setVideoFileItem(global_ugc_id!, ugc_item_id, video_blob, s_idx + 1);

                        // if(form_data.model_video === MODEL_VIDEOS["veo-3.0"]){
                        //     const pcmBlob = await aiService.generateTTSFromAnalysis(json_describe);
                        //     const pcmArray = new Uint8Array(await pcmBlob.arrayBuffer());
                        //     const wavBlob = pcmToWav(pcmArray, 24000);
                        //
                        //     // 🔑 SIMPAN UNTUK UI
                        //     voiceover_audio_blob = wavBlob;
                        //
                        //     await mabarApi.setVoiceOverFileItem(
                        //         global_ugc_id!,
                        //         ugc_item_id,
                        //         wavBlob,
                        //         s_idx + 1
                        //     );
                        // }


                        const local_video_url = URL.createObjectURL(video_blob);
                        const local_audio_url = voiceover_audio_blob ? URL.createObjectURL(voiceover_audio_blob) : null;

                        // add generate_urls to generation item with push (append)
                        // get current generate_urls
                        const current_item = generations_list.find(g => g.id === temp_id);

                        const current_urls = current_item?.generate_urls || [];
                        // current_audios must be array of objects with key current_index
                        const current_audios = current_item?.local_audio_urls || [];
                        const current_local_audio_obj = local_audio_url ? { scene_index: s_idx + 1, url: local_audio_url } : null;
                        set_generations_list(prev => prev.map(g => g.id === temp_id ? {
                            ...g,
                            generate_urls: [...current_urls, local_video_url],
                            local_audio_urls: [...current_audios, ...(current_local_audio_obj ? [current_local_audio_obj] : [])],
                            status: TaskStatus.UPLOADING_S3
                        } : g));

                        previous_local_video_url = local_video_url;
                        last_video_blob = video_blob;
                    }

                    await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.UPLOADING_S3);
                    set_generations_list(prev => prev.map(g => g.id === temp_id ? { ...g, status: TaskStatus.UPLOADING_S3, progress: 85 } : g));

                    try {
                        // const s3_url = await s3Service.uploadVideoToS3(video_blob, target_storage, form_data.bucket, filename);
                        await mabarApi.setCompleteItem(global_ugc_id!, ugc_item_id);
                        have_completed_once = true;
                        set_generations_list(prev => prev.map(g => g.id === temp_id ? { ...g, status: TaskStatus.COMPLETED, progress: 100 } : g));
                    } catch (s3_err: any) {
                        console.error("[StartProduction] S3 Upload Failed, keeping local URL", s3_err);
                        const reason = `[S3 Error] ${s3_err.message || "Upload gagal"}`;
                        await mabarApi.setFailItem(global_ugc_id!, ugc_item_id, reason);
                        set_generations_list(prev => prev.map(g => g.id === temp_id ? { ...g, status: TaskStatus.FAILED, failed_reason: reason } : g));
                        showToast("Video berhasil digenerate tapi gagal upload ke S3. Silakan download langsung.", "warning");
                    }
                } catch (item_err: any) {
                    const error_message = item_err.response?.data?.message || item_err.message || "Gagal memproses item";
                    const reason = `[Item Error] ${error_message}`;
                    await mabarApi.setFailItem(global_ugc_id!, ugc_item_id, reason);
                    set_generations_list(prev => prev.map(g => g.id === temp_id ? { ...g, status: TaskStatus.FAILED, failed_reason: reason } : g));
                }
            }

            if(have_completed_once){
                await mabarApi.setUgcComplete(global_ugc_id!);
                showToast("Produksi batch selesai", "success");
            }else{
                throw new Error("Semua item produksi gagal diproses");
            }

        } catch (err: any) {
            const error_message = err.response?.data?.message || err.message || "Gagal memulai produksi";
            showToast(error_message, "error");
            if (global_ugc_id) {
                try {
                    await mabarApi.setUgcFail(global_ugc_id, error_message);
                } catch (fail_report_err) {
                    console.error("Fail reporting error:", fail_report_err);
                }
            }
        } finally {
            setIs_generating(false);
        }
    };

    const storyBoardChunk = async (target_product, target_chars) => {
        const storyboard_chunks = [];
        let current_duration = 0;
        while (current_duration < form_data.min_duration) {
            const chunk = await aiService.generateStoryboardChunk(
                { product: target_product, characters: target_chars, user_prompt: form_data.prompt, negative_prompt: form_data.negative_prompt },
                storyboard_chunks.flatMap(c => c.scenes)
            );
            storyboard_chunks.push(chunk);
            // current_duration += chunk.scenes.reduce((acc, s) => acc + (s.duration || 5), 0);
            current_duration += AVG_DURATION_PER_VIDEO;
        }

        if(storyboard_chunks.length === 0){
            throw new Error("Storyboard gagal dibuat. Pastikan prompt cukup jelas dan lengkap.");
        }

        return storyboard_chunks;
    }

    const runItemPipeline = async (ugc_id: string, ugc_item_id: string, order_index: number, context: {
        target_product: Product;
        target_chars: Character[];
        target_chars_with_b64: (Character & { b64: string })[];
        target_storage: ObjectStorage;
        product_b64: string;
    }) => {
    }

    const retryItem = async (item: GenerationItem) => {
        const ugc_item_id = item.id.replace('item-', '');
        const target_product = products_list.find(p => p.id.toString() === form_data.product_id)!;
        const target_chars = characters_list.filter(c => form_data.character_ids.includes(c.id));
        const target_storage = storages_list.find(s => s.object_storage_id.toString() === form_data.object_storage_id)!;

        showToast(`Mencoba kembali Item #${item.order_index}...`, "info");

        // Siapkan aset kembali (perlu dioptimasi jika sering dipanggil)
        const product_img_url = target_product.product_reference_image_path ? `${URL_UPLOAD_ASSET}/${target_product.product_reference_image_path.replace(/^\//, '')}` : target_product.image_url;
        const product_b64 = await urlToBase64(product_img_url);
        const target_chars_with_b64 = await Promise.all(target_chars.map(async c => {
            const url = c.character_image_path ? `${URL_UPLOAD_ASSET}/${c.character_image_path.replace(/^\//, '')}` : (c.image_url || '');
            const b64 = await urlToBase64(url);
            return { ...c, b64 };
        }));

        await runItemPipeline(item.ugc_id, ugc_item_id, item.order_index, {
            target_product,
            target_chars,
            target_chars_with_b64,
            target_storage,
            product_b64
        });
    };

    const changeApiKey = (changed_value) => {
        console.log("Changed API Key Gemini:", changed_value);

        // 1. Cek apakah changed_value ada
        // 2. Cek apakah changed_value.item ada
        if (!changed_value || !changed_value.item) {
            localStorage.setItem("api_key", process.env.API_KEY)
            set_api_key(null);
            set_form_data({ ...form_data, gemini_api_key_id: null });
            return;
        }

        const item = changed_value.item;

        // Pastikan properti key_value memang ada di dalam item
        if (item && item.key_value) {
            localStorage.setItem("api_key", item.key_value)
            set_api_key(item.key_value);
            set_form_data({ ...form_data, gemini_api_key_id: changed_value.value });
            showToast("API Key Gemini diperbarui", "success");
        } else {
            console.error("Properti key_value tidak ditemukan dalam item:", item);
        }
    }


    useEffect(() => {
        console.log("[API Key] Updated:", api_key);
        console.log("[FormData] Updated:", form_data);
    }, [api_key, form_data]);

    return (
        <div className="p-8 max-w-[1920px] mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-full">
                {/* Left Section: Input Parameters */}
                <div className="xl:col-span-9 space-y-6">
                    <div className="bg-slate-900/50 border border-white/5 rounded-[2.5rem] p-10 shadow-2xl backdrop-blur-md">
                        <header className="flex items-center space-x-4 mb-10">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><i className="fas fa-video text-white text-xl"></i></div>
                            <div>
                                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Affiliate Video <span className="text-blue-500">Generation</span></h2>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mt-1">UGC Pipeline v1.2</p>
                            </div>
                        </header>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            <div className="space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Judul</label>
                                    <input type="text" value={form_data.name} onChange={e => set_form_data({...form_data, name: e.target.value})} className="w-full bg-slate-900/50 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 focus:ring-1 ring-blue-500/50 outline-none font-semibold transition-all placeholder:text-slate-600" placeholder="Input Nama..." />
                                </div>

                                {/*create select option for model_video from MODEL_VIDEOS constant*/}
                                <div className="space-y-3 hidden">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Model Video</label>
                                    <select value={form_data.model_video} onChange={e => set_form_data({...form_data, model_video: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all">
                                        {Object.entries(MODEL_VIDEOS).map(([label, key]) => (
                                            <option key={label} value={key}>
                                                {/*{(label === "veo-3.0" ? "Model 3.0 (Tanpa Suara)" : "Model 3.1 (Wajib Pilih Api Key & Set Billing Api Key)")}*/}
                                                {/*using if else to show label*/}
                                                {label === "veo-3.0" && "Model 3.0 (Text To Video (Free Beta))"}
                                                {label === "veo-3.0-preview" && "Model 3.0 Preview (Image To Video Free Beta)"}
                                                {label === "veo-3.1" && "Model 3.1 (Wajib Pilih Api Key & Set Billing Api Key)"}
                                            </option>
                                        ))}
                                    </select>
                                    {/*tambahkan note dengan warna information untuk saat ini pakai if select ada note model 3.0 masih gratis karena beta (sewaktu waktu bisa berubah tergantung kebijakan google), ketika select 3.0 ada note model 3.1 menggunakan biaya dari api key gemini yang dipilih dan wajib setting billing di gcp console */}
                                    <div className="text-[10px] text-slate-500 italic text-orange-400">
                                        {form_data.model_video === MODEL_VIDEOS["veo-3.0"] ? (
                                            <>Note: Model 3.0 masih gratis karena dalam tahap beta. (Kebijakan dapat berubah sewaktu-waktu)</>
                                        ) : (
                                            <>Note: Model 3.1 menggunakan biaya dari API Key Gemini yang dipilih. Pastikan Anda telah mengatur billing di GCP Console.</>
                                        )}
                                    </div>

                                </div>

                                {/*if model_video is "veo-3.1", show select2 (using Select2 Component ) for get api keys mabarService.getApiKeys()*/}
                                {/*if model_video is veo-3.0 hide select2 for api keys*/}
                                <div className={form_data.model_video === MODEL_VIDEOS["veo-3.1"] ? "block" : "hidden"}>
                                    <Select2Async
                                        label="Pilih API Key Gemini"
                                        endpoint={`${API_BASE_URL}/api_keys`}
                                        placeholder="Cari Key..."
                                        mapResponse={(data) => {
                                            const key_managements = data?.key_managements || [];
                                            return key_managements.map((k: any) => ({
                                                value: k.id.toString(),
                                                label: k.key_name,
                                                item: k // Pastikan 'k' memiliki properti 'key_value'
                                            }));
                                        }}
                                        onChange={(val) => changeApiKey(val)}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Pilih Produk</label>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                        {products_list.map(p => {
                                            const img_url = p.product_reference_image_path ? `${URL_UPLOAD_ASSET}/${p.product_reference_image_path.replace(/^\//, '')}` : p.image_url;
                                            const is_selected = form_data.product_id === p.id.toString();
                                            return (
                                                <button key={p.id} onClick={() => set_form_data({...form_data, product_id: p.id.toString()})} className={`group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${is_selected ? 'border-blue-500 ring-4 ring-blue-500/20 shadow-xl' : 'border-white/5 hover:border-white/10'}`}>
                                                    <img src={img_url} className={`w-full h-full object-cover transition-all ${is_selected ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`} alt={p.name} />
                                                    {is_selected && <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-lg"><i className="fas fa-check text-[10px] text-white"></i></div>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Pilih Karakter</label>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                                        {characters_list.map(c => {
                                            const is_selected = form_data.character_ids.includes(c.id);
                                            const img_url = c.character_image_path ? `${URL_UPLOAD_ASSET}/${c.character_image_path.replace(/^\//, '')}` : (c.image_url || 'https://picsum.photos/seed/char/100');
                                            return (
                                                <button key={c.id} onClick={() => {
                                                    const ids = is_selected ? form_data.character_ids.filter(id => id !== c.id) : [...form_data.character_ids, c.id];
                                                    set_form_data({...form_data, character_ids: ids});
                                                }} className={`group relative aspect-[3/4] rounded-xl overflow-hidden border transition-all ${is_selected ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-lg scale-105 z-10' : 'border-white/5 opacity-60 hover:opacity-100'}`}>
                                                    <img src={img_url} className="w-full h-full object-cover" alt={c.name} />
                                                    {is_selected && <div className="absolute top-1 right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center shadow-lg"><i className="fas fa-check text-[7px] text-white"></i></div>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-8">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Brief Content / Prompt</label>
                                    <textarea value={form_data.prompt} onChange={e => set_form_data({...form_data, prompt: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-6 py-4 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all h-40 resize-none font-medium leading-relaxed" placeholder="Ceritakan alur cerita video Anda secara detail..." />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Aspect Ratio</label>
                                        <select value={form_data.aspect_ratio} onChange={e => set_form_data({...form_data, aspect_ratio: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all">
                                            {ASPECT_RATIOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Jumlah Produksi</label>
                                        <input type="number" min="1" max="60" value={form_data.amount} onChange={e => set_form_data({...form_data, amount: parseInt(e.target.value) || 1})} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Durasi Minimum (detik)</label>
                                        <input type="number" min="5" max="300" value={form_data.min_duration} onChange={e => set_form_data({...form_data, min_duration: parseInt(e.target.value) || DEFAULT_MIN_DURATION})} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Resolusi Video</label>
                                        <select value={form_data.resolution} onChange={e => set_form_data({...form_data, resolution: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all">
                                            {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="pt-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Storage</label>
                                            <select value={form_data.object_storage_id} onChange={e => handleStorageChange(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all">
                                                {storages_list.map(s => <option key={s.object_storage_id} value={s.object_storage_id.toString()}>{s.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">Bucket</label>
                                            <select value={form_data.bucket} onChange={e => set_form_data({...form_data, bucket: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all">
                                                {available_buckets.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <button onClick={startProduction} disabled={is_generating} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-3 rounded-[2rem] uppercase tracking-widest text-xs transition-all shadow-2xl shadow-blue-600/20 active:scale-95 flex items-center justify-center space-x-3 mt-4">
                                    {is_generating ? <><i className="fas fa-circle-notch fa-spin text-lg"></i><span>Processing Generation...</span></> : <><i className="fas fa-rocket text-lg"></i><span>Initialize Content Generation</span></>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Section: Live Production Pipeline */}
                <div className="xl:col-span-3 space-y-6">
                    <div className="bg-slate-900/50 border border-white/5 rounded-[2.5rem] p-8 shadow-2xl min-h-[800px] flex flex-col backdrop-blur-md">
                        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                            <h3 className="text-sm font-black text-white italic uppercase tracking-tight">Production Pipeline</h3>
                            <div className="flex items-center space-x-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-[0.2em]">Live Tracking</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                            {generations_list.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-20 grayscale scale-90">
                                    <div className="w-24 h-24 rounded-[2rem] border-2 border-dashed border-slate-700 flex items-center justify-center mb-6"><i className="fas fa-video-slash text-4xl"></i></div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-2">No Active Pipeline</p>
                                    <p className="text-[9px] font-medium max-w-[200px]">Atur parameter di kiri dan tekan Generate untuk memulai proses produksi.</p>
                                </div>
                            ) : (
                                generations_list.map((item) => (
                                    <div key={item.id} className="bg-slate-950/40 border border-white/5 rounded-3xl p-5 transition-all hover:border-white/10 group relative overflow-hidden">
                                        <div className="flex flex-col space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest italic">Item #{item.order_index}</h4>
                                                    <p className="text-[7px] font-mono text-slate-600 truncate max-w-[120px]">{item.id}</p>
                                                </div>
                                                <div className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${item.status === TaskStatus.COMPLETED ? 'bg-emerald-500/10 text-emerald-500' : item.status === TaskStatus.FAILED ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                    {item.status}
                                                </div>
                                            </div>

                                            <div className="bg-slate-900 rounded-2xl border border-white/5 relative overflow-hidden group/vid shadow-inner p-4">
                                                {item.generate_urls && item.generate_urls.length > 0 ? (
                                                    /* Menggunakan Grid agar jika ada > 1 video, tampilannya tetap rapi */
                                                    <div className="grid grid-cols-1 gap-6">
                                                        {item.generate_urls.map((url, index) => {
                                                            const sceneIndex = index + 1;
                                                            const audioObj = item.local_audio_urls?.find(
                                                                a => a.scene_index === sceneIndex
                                                            );

                                                            return (
                                                                <div key={url} className="flex flex-col space-y-3">
                                                                    {/* Video Container dengan Aspect Ratio yang konsisten */}
                                                                    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black/20">
                                                                        <video
                                                                            src={url}
                                                                            className="w-full h-full object-cover"
                                                                            controls
                                                                            playsInline
                                                                        />
                                                                    </div>

                                                                    {/* Audio Player di bawah video */}
                                                                    {audioObj && (
                                                                        <div className="bg-white/5 p-2 rounded-lg">
                                                                            <audio
                                                                                src={audioObj.url}
                                                                                className="w-full h-8"
                                                                                controls
                                                                                playsInline
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    /* State Loading / Empty tetap menjaga aspect ratio agar layout tidak loncat */
                                                    <div className="aspect-video flex flex-col items-center justify-center space-y-2 opacity-40">
                                                        {item.status === TaskStatus.FAILED ? (
                                                            <i className="fas fa-exclamation-triangle text-rose-500 text-2xl"></i>
                                                        ) : (
                                                            <i className="fas fa-film text-slate-500 text-2xl animate-pulse"></i>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Overlay Loading Status */}
                                                {(!item.generate_urls || item.generate_urls.length === 0) && item.status !== TaskStatus.FAILED && (
                                                    <div className="absolute inset-0 bg-blue-600/5 flex items-center justify-center backdrop-blur-[1px]">
                                                        <i className="fas fa-cog fa-spin text-blue-500/50 text-xl"></i>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Processing</span>
                                                    <span className="text-[9px] font-black text-blue-400 font-mono">{item.progress}%</span>
                                                </div>
                                                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                                    <div className={`h-full transition-all duration-700 ease-out rounded-full ${item.status === TaskStatus.FAILED ? 'bg-rose-600' : 'bg-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.3)]'}`} style={{ width: `${item.progress}%` }} />
                                                </div>
                                            </div>

                                            {item.failed_reason && (
                                                <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                                                    <p className="text-[8px] text-rose-400 italic leading-relaxed line-clamp-3">{item.failed_reason}</p>
                                                </div>
                                            )}

                                            <div className="flex flex-col space-y-2 pt-2">
                                                {/*{item.status === TaskStatus.FAILED && (*/}
                                                {/*    <button*/}
                                                {/*        onClick={() => retryItem(item)}*/}
                                                {/*        className="w-full bg-blue-600 hover:bg-blue-500 border border-blue-400/20 py-2.5 rounded-xl text-[8px] font-black text-white uppercase tracking-widest flex items-center justify-center space-x-2 transition-all shadow-lg shadow-blue-600/10"*/}
                                                {/*    >*/}
                                                {/*        <i className="fas fa-redo-alt text-[7px]"></i>*/}
                                                {/*        <span>Retry Step</span>*/}
                                                {/*    </button>*/}
                                                {/*)}*/}
                                                <div className="flex items-center space-x-2">
                                                    {item.status === TaskStatus.FAILED && (
                                                        <button onClick={() => showToast(item.failed_reason || "Error tidak diketahui", "error")} className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 py-2.5 rounded-xl text-[8px] font-black text-rose-400 uppercase tracking-widest transition-all">
                                                            Detail Error
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5">
                            <div className="bg-slate-950/50 rounded-2xl p-4 border border-white/5 flex items-center space-x-4">
                                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500"><i className="fas fa-microchip"></i></div>
                                <div>
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">System Load</p>
                                    <p className="text-[10px] font-bold text-white uppercase italic">Optimal Performance</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GenerateContent;
