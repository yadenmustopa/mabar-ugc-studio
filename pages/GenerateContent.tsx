import React, {useEffect, useState} from 'react';
import {mabarApi} from '../services/mabarService';
import {aiService} from '../services/geminiService';
import {Character, GenerationItem, ObjectStorage, Product, TaskStatus} from '../types';
import {base64ToBlob, showToast, urlToBase64} from '../utils';
import {ASPECT_RATIOS, AVG_DURATION_PER_VIDEO, DEFAULT_MIN_DURATION, RESOLUTIONS, URL_UPLOAD_ASSET} from '../constants';
import {captureLastFrameFromVideoBlob} from "@/services/frameService";

const GenerateContent: React.FC = () => {
    const [products_list, set_products_list] = useState<Product[]>([]);
    const [characters_list, set_characters_list] = useState<Character[]>([]);
    const [storages_list, set_storages_list] = useState<ObjectStorage[]>([]);
    const [available_buckets, set_available_buckets] = useState<string[]>([]);
    const [generations_list, set_generations_list] = useState<GenerationItem[]>([]);
    const [is_generating, setIs_generating] = useState(false);

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
        bucket: ''
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
            showToast("Judul Campaign wajib diisi", "warning");
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
                bucket: form_data.bucket
            };

            const ugc_response = await mabarApi.initUGC(ugc_payload);
            global_ugc_id = ugc_response.id;

            const target_product = products_list.find(p => p.id.toString() === form_data.product_id)!;
            const target_chars = characters_list.filter(c => form_data.character_ids.includes(c.id));
            const target_storage = storages_list.find(s => s.object_storage_id.toString() === form_data.object_storage_id)!;

            showToast("Mempersiapkan referensi visual...", "info");
            const product_img_url = target_product.product_reference_image_path
                ? `${URL_UPLOAD_ASSET}/${target_product.product_reference_image_path.replace(/^\//, '')}`
                : target_product.image_url;

            const product_b64 = await urlToBase64(product_img_url);

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
                    let storyboard_chunks: any[] = [];
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
                    await mabarApi.setStoryboard(global_ugc_id!, ugc_item_id, storyboard_chunks);

                    await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.GENERATING_FIRST_SCENE_IMAGE);
                    set_generations_list(prev => prev.map(g => g.id === temp_id ? { ...g, status: TaskStatus.GENERATING_FIRST_SCENE_IMAGE, progress: 40 } : g));

                    let previous_local_video_url = null;
                    let last_video_blob: Blob | null = null;
                    for (let s_idx = 0; s_idx < storyboard_chunks.length; s_idx++) {
                        if(s_idx === 0) {
                            // IMPROVEMENT: Pass target_chars_with_b64 for consistency and multiple character support
                            const b64 = await aiService.generateFirstSceneImage(
                                storyboard_chunks[s_idx],
                                product_b64,
                                target_chars_with_b64,
                                form_data.aspect_ratio
                            );

                            await mabarApi.setFirstSceneImage(global_ugc_id!, ugc_item_id, base64ToBlob(b64), s_idx + 1);

                            // generate video by scene image
                            await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.GENERATING_VIDEO);
                            set_generations_list(prev => prev.map(g => g.id === temp_id ? { ...g, status: TaskStatus.GENERATING_VIDEO, progress: 70 } : g));
                            const video_blob = await aiService.generateVideoVeo(b64, storyboard_chunks[s_idx].description, form_data.aspect_ratio);

                            const local_video_url = URL.createObjectURL(video_blob);

                            // add generate_urls to generation item with push (append)
                            // get current generate_urls
                            const current_item = generations_list.find(g => g.id === temp_id);

                            const current_urls = current_item?.generate_urls || [];
                            set_generations_list(prev => prev.map(g =>  g.id === temp_id ? { ...g, generate_urls: [...current_urls, local_video_url], status: TaskStatus.UPLOADING_S3 } : g));
                            await mabarApi.setVideoFileItem(global_ugc_id!, ugc_item_id, video_blob, s_idx + 1);

                            previous_local_video_url = local_video_url;
                            last_video_blob = video_blob;
                        }else{
                            // get last captured image from previous video
                            // ===== SCENE LANJUTAN =====
                            if (!previous_local_video_url) {
                                throw new Error("Previous video URL not found");
                            }

                            // 🔑 AMBIL LAST FRAME VIDEO SEBELUMNYA
                            const last_b64_image = await captureLastFrameFromVideoBlob(
                                last_video_blob,
                                (p) => { console.log(`Capturing last frame progress: ${p}%`); },
                                0.12 // epsilon → detik sebelum akhir
                            );

                            console.log("[StartProduction] Last frame base64 for next scene:", last_b64_image);

                            let blob = base64ToBlob(last_b64_image);

                            console.log("[StartProduction] Last frame blob for next scene:", blob);

                            await mabarApi.setFirstSceneImage(global_ugc_id!, ugc_item_id, blob, s_idx + 1);

                            // generate video by scene image
                            await mabarApi.setStep(global_ugc_id!, ugc_item_id, TaskStatus.GENERATING_VIDEO);
                            set_generations_list(prev => prev.map(g => g.id === temp_id ? { ...g, status: TaskStatus.GENERATING_VIDEO, progress: 70 } : g));
                            const video_blob = await aiService.generateVideoVeo(last_b64_image, storyboard_chunks[s_idx].description, form_data.aspect_ratio);

                            const local_video_url = URL.createObjectURL(video_blob);

                            // add generate_urls to generation item with push (append)
                            // get current generate_urls
                            const current_item = generations_list.find(g => g.id === temp_id);

                            const current_urls = current_item?.generate_urls || [];
                            set_generations_list(prev => prev.map(g =>  g.id === temp_id ? { ...g, generate_urls: [...current_urls, local_video_url], status: TaskStatus.UPLOADING_S3 } : g));
                            await mabarApi.setVideoFileItem(global_ugc_id!, ugc_item_id, video_blob, s_idx + 1);

                            previous_local_video_url = local_video_url;
                        }
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

    return (
        <div className="p-8 max-w-[1920px] mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-full">
                {/* Left Section: Input Parameters */}
                <div className="xl:col-span-9 space-y-6">
                    <div className="bg-slate-900/50 border border-white/5 rounded-[2.5rem] p-10 shadow-2xl backdrop-blur-md">
                        <header className="flex items-center space-x-4 mb-10">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><i className="fas fa-video text-white text-xl"></i></div>
                            <div>
                                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Generation <span className="text-blue-500">Params</span></h2>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mt-1">UGC Pipeline v1.2</p>
                            </div>
                        </header>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            <div className="space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Judul Campaign</label>
                                    <input type="text" value={form_data.name} onChange={e => set_form_data({...form_data, name: e.target.value})} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-6 py-4 text-white focus:ring-1 ring-blue-500 outline-none transition-all placeholder:text-slate-700" placeholder="Input Nama..." />
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

                                <button onClick={startProduction} disabled={is_generating} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-6 rounded-[2rem] uppercase tracking-widest text-xs transition-all shadow-2xl shadow-blue-600/20 active:scale-95 flex items-center justify-center space-x-3 mt-4">
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

                                            <div className="aspect-video bg-slate-900 rounded-2xl flex items-center justify-center border border-white/5 relative overflow-hidden group/vid shadow-inner">
                                                {item.generate_urls && item.generate_urls.length > 0 ?
                                                    item.generate_urls.map( ((url, index) => (
                                                        <>
                                                            <video key={url} src={url} className="w-full h-full object-cover absolute inset-0" controls playsInline crossOrigin="anonymous" autoPlay={item.status === TaskStatus.COMPLETED} muted loop />
                                                            <div>
                                                                <a href={url} download={`Mabar_Studio_Video_${item.order_index}_${index}.mp4`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-slate-900 hover:bg-slate-800 border border-white/5 py-2.5 rounded-xl text-[8px] font-black text-slate-300 uppercase tracking-widest flex items-center justify-center space-x-2 transition-all">
                                                                    <i className="fas fa-download text-[7px]"></i>
                                                                    <span>Download Result</span>
                                                                </a>
                                                            </div>
                                                        </>
                                                    ))
                                                ) : (
                                                    <div className="flex flex-col items-center space-y-2 opacity-40">
                                                        {item.status === TaskStatus.FAILED ? <i className="fas fa-exclamation-triangle text-rose-500 text-2xl"></i> : <i className="fas fa-film text-slate-500 text-2xl animate-pulse"></i>}
                                                    </div>
                                                )}
                                                {(!item.generate_urls || item.generate_urls.length === 0) && item.status !== TaskStatus.FAILED && (
                                                    <div className="absolute inset-0 bg-blue-600/5 flex items-center justify-center backdrop-blur-[1px]">
                                                        <i className="fas fa-cog fa-spin text-blue-500/50 text-xs"></i>
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
