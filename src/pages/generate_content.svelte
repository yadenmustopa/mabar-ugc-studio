
<script>
  import { onMount } from 'svelte';
  import { ai_service } from '../services/gemini_service';
  import { MODELS, ASPECT_RATIOS } from '../constants';
  
  let project_name = "New Campaign";
  let prompt_input = "";
  let selected_aspect_ratio = "16:9";
  let is_processing = false;
  let generation_status = "Idle";
  let current_progress = 0;
  let result_video_url = null;
  let error_message = "";
  let needs_key_reset = false;

  async function handle_synthesis() {
    if (!prompt_input) return;
    
    const has_key = await window.aistudio.hasSelectedApiKey();
    if (!has_key) {
      await window.aistudio.openSelectKey();
      return;
    }

    is_processing = true;
    error_message = "";
    needs_key_reset = false;
    current_progress = 10;
    generation_status = "Analyzing Storyboard...";

    try {
      const storyboard = await ai_service.generate_storyboard({
        prompt: prompt_input,
        product_name: "UGC Product"
      });
      
      current_progress = 30;
      generation_status = "Synthesizing Video Frames...";

      const mock_img = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

      const video_blob = await ai_service.generate_video_asset(
        mock_img, 
        storyboard.description || prompt_input,
        selected_aspect_ratio
      );

      result_video_url = URL.createObjectURL(video_blob);
      current_progress = 100;
      generation_status = "Complete";
    } catch (err) {
      if (err.message === "KEY_RESET_REQUIRED") {
        needs_key_reset = true;
        error_message = "Project Google Cloud Anda tidak memiliki akses ke Veo atau Billing belum aktif.";
      } else {
        error_message = err.message || "Synthesis Failed";
      }
      generation_status = "Failed";
    } finally {
      is_processing = false;
    }
  }

  async function trigger_key_selection() {
    await window.aistudio.openSelectKey();
    needs_key_reset = false;
    error_message = "";
  }
</script>

<div class="min-h-screen bg-slate-950 text-slate-100 p-8">
  <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
    
    <!-- LEFT: EDITOR PANEL -->
    <div class="lg:col-span-7 space-y-6">
      <header class="flex items-center space-x-4 mb-8">
        <div class="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <i class="fas fa-film text-xl"></i>
        </div>
        <div>
          <h2 class="text-2xl font-black italic tracking-tighter uppercase">Synthesis <span class="text-blue-500">Studio</span></h2>
          <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Model: {MODELS.VIDEO}</p>
        </div>
      </header>

      {#if needs_key_reset}
        <div class="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 mb-6 flex flex-col items-center text-center">
          <i class="fas fa-exclamation-circle text-amber-500 text-2xl mb-3"></i>
          <h4 class="text-amber-500 font-bold mb-2">Requested Entity Not Found</h4>
          <p class="text-xs text-slate-400 mb-4 max-w-sm">Error ini biasanya berarti API Key yang digunakan tidak memiliki izin untuk model Veo. Pastikan Anda menggunakan project dengan Billing yang sudah aktif.</p>
          <button 
            on:click={trigger_key_selection}
            class="bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-6 py-2.5 rounded-full uppercase tracking-widest transition-all"
          >
            Pilih Project & Key Baru
          </button>
        </div>
      {/if}

      <div class="bg-slate-900/50 border border-white/5 rounded-3xl p-8 backdrop-blur-md">
        <div class="space-y-6">
          <div class="flex flex-col space-y-2">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Prompt Brief</label>
            <textarea 
              bind:value={prompt_input}
              placeholder="Describe cinematic movement..."
              class="bg-slate-950 border border-white/10 rounded-xl px-4 py-4 text-sm h-48 resize-none focus:outline-none focus:ring-1 ring-blue-500"
            ></textarea>
          </div>

          <button 
            on:click={handle_synthesis}
            disabled={is_processing}
            class="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-blue-600/10"
          >
            {is_processing ? 'Processing Production Pipeline...' : 'Initialize Synthesis'}
          </button>
        </div>
      </div>
    </div>

    <!-- RIGHT: PREVIEW PANEL -->
    <div class="lg:col-span-5">
      <div class="bg-slate-900 border border-white/5 rounded-3xl p-6 h-full flex flex-col justify-center">
        {#if result_video_url}
          <div class="w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black">
            <video src={result_video_url} controls class="w-full h-auto"></video>
          </div>
        {:else if is_processing}
          <div class="text-center space-y-4 px-8">
             <div class="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                <div class="bg-blue-500 h-full transition-all duration-500" style="width: {current_progress}%"></div>
             </div>
             <p class="text-[10px] font-bold text-slate-500 uppercase">{generation_status}</p>
          </div>
        {:else}
          <div class="text-center opacity-20 py-20">
            <i class="fas fa-clapperboard text-6xl mb-4"></i>
            <p class="text-xs uppercase tracking-widest">Await Input</p>
          </div>
        {/if}

        {#if error_message && !needs_key_reset}
          <div class="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-medium">
            {error_message}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
