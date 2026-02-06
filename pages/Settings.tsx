
import React, { useState, useEffect, useRef } from 'react';
import { mabarApi } from '../services/mabarService';
import { ApiKey } from '../types';
import { showToast } from '../utils';

declare const google: any;

type SetupView = 'selection' | 'automatic' | 'manual';

const Settings: React.FC<{ user_email?: string, google_id_token?: string | null }> = ({ user_email, google_id_token }) => {
  const [view, set_view] = useState<SetupView>('selection');
  const [step, set_step] = useState(google_id_token ? 1 : 0);
  const [is_creating, set_is_creating] = useState(false);
  const [creation_status, set_creation_status] = useState("");
  const google_button_ref = useRef<HTMLDivElement>(null);

  const [form_data, set_form_data] = useState({
    project_name: '',
    tax_status: 'Personal',
    nik: '',
    address: '',
    province: '',
    city: '',
    postal_code: '',
    card_name: '',
    card_number: '',
    expiry: '',
    cvv: ''
  });

  const current_origin = window.location.origin;

  useEffect(() => {
    if (view === 'automatic' && step === 0 && google_button_ref.current && typeof google !== 'undefined') {
      try {
        google.accounts.id.renderButton(
          google_button_ref.current,
          { theme: "filled_blue", size: "large", width: 400, shape: "pill" }
        );
      } catch (err) { console.error(err); }
    }
  }, [view, step]);

  const handle_finalize = async () => {
    set_is_creating(true);
    set_creation_status("Provisioning Resources...");
    try {
      const payload = {
        project_name: form_data.project_name,
        email: user_email,
        google_id_token: google_id_token,
        tax_info: { nik: form_data.nik, address: form_data.address, city: form_data.city, postal_code: form_data.postal_code },
        payment_method: {
          card_number: form_data.card_number.replace(/\s/g, ''),
          card_name: form_data.card_name.toUpperCase(),
          expiry: form_data.expiry,
          cvv: form_data.cvv
        }
      };
      await mabarApi.generateApiKey(payload);
      showToast("Project berhasil dibuat!", "success");
      set_view('selection');
    } catch (err: any) {
      showToast(err.response?.data?.message || "Gagal membuat project", "error");
    } finally {
      set_is_creating(false);
    }
  };

  const copy_origin = () => {
    navigator.clipboard.writeText(current_origin);
    showToast("URL App berhasil disalin!", "success");
  };

  const ManualStep = ({ num, title, desc }: { num: number, title: string, desc: string }) => (
    <div className="flex space-x-4 p-5 bg-slate-900/50 border border-white/5 rounded-2xl hover:border-blue-500/30 transition-all">
      <div className="w-8 h-8 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-[10px] font-black">{num}</div>
      <div>
        <h5 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">{title}</h5>
        <p className="text-[10px] text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="p-8 md:p-12 max-w-5xl mx-auto animate-in fade-in duration-500">
      <header className="mb-12">
        <div className="flex items-center space-x-4 mb-3">
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center border border-white/5 text-slate-400">
            <i className="fas fa-cog text-xl"></i>
          </div>
          <div>
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Studio <span className="text-blue-500">Settings</span></h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Environment & Infrastructure Control</p>
          </div>
        </div>
      </header>

      <div className="space-y-10">
        {/* Section: Environment Info (New) */}
        <section className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-xl border-l-4 border-l-blue-500/50 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center border border-blue-500/20 text-blue-500 shadow-inner">
                <i className="fas fa-network-wired text-xl"></i>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Current App Origin</h3>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Konfigurasi Authorized JavaScript Origins</p>
              </div>
            </div>
            
            <div className="flex-1 max-w-md flex items-center space-x-3 bg-slate-950/80 border border-white/5 rounded-2xl p-3 shadow-inner">
              <div className="flex-1 font-mono text-[11px] text-emerald-400 truncate px-2 select-all">
                {current_origin}
              </div>
              <button 
                onClick={copy_origin}
                className="w-10 h-10 bg-slate-900 hover:bg-blue-600 border border-white/10 text-white rounded-xl transition-all active:scale-90"
                title="Salin URL"
              >
                <i className="fas fa-copy text-xs"></i>
              </button>
            </div>
          </div>
          <div className="mt-6 flex items-start space-x-3 text-slate-500">
             <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
             <p className="text-[10px] font-medium leading-relaxed italic">
               Gunakan URL di atas untuk didaftarkan pada Google Cloud Console Credentials di bagian <span className="text-white font-bold">"Authorized JavaScript origins"</span> agar OAuth 2.0 berfungsi dengan normal.
             </p>
          </div>
        </section>

        <section className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-10 backdrop-blur-xl relative overflow-hidden shadow-2xl">
          {/* Header Section */}
          <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/5">
            <div>
              <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Cloud Project Setup</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Konfigurasi Akses Gemini & Veo Pro</p>
            </div>
            {view !== 'selection' && !is_creating && (
              <button onClick={() => set_view('selection')} className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest border border-white/10 px-4 py-2 rounded-xl transition-all">Kembali</button>
            )}
          </div>

          {is_creating ? (
             <div className="py-20 flex flex-col items-center text-center">
               <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-6"></div>
               <p className="text-blue-400 font-mono text-[10px] uppercase tracking-[0.3em]">{creation_status}</p>
             </div>
          ) : view === 'selection' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <button onClick={() => set_view('automatic')} className="group p-8 bg-slate-950/50 border border-white/5 rounded-3xl text-left hover:border-blue-500/40 transition-all hover:shadow-2xl hover:shadow-blue-600/10">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                  <i className="fas fa-bolt text-white"></i>
                </div>
                <h4 className="text-white font-black text-lg uppercase italic tracking-tighter mb-2">Auto Provisioning</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Buat Project & API Key secara instan menggunakan integrasi Google Identity kami. Cepat dan aman.</p>
              </button>

              <button onClick={() => set_view('manual')} className="group p-8 bg-slate-950/50 border border-white/5 rounded-3xl text-left hover:border-slate-500 transition-all">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 border border-white/10 group-hover:scale-110 transition-transform">
                  <i className="fas fa-book text-slate-400"></i>
                </div>
                <h4 className="text-white font-black text-lg uppercase italic tracking-tighter mb-2">Manual Guide</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Gunakan Project Google Cloud yang sudah ada. Ikuti langkah konfigurasi mandiri kami.</p>
              </button>
            </div>
          ) : view === 'manual' ? (
            <div className="space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <ManualStep num={1} title="GCP Console" desc="Masuk ke console.cloud.google.com" />
              <ManualStep num={2} title="Enable API" desc="Aktifkan Generative Language API di Marketplace" />
              <ManualStep num={3} title="Setup Billing" desc="Hubungkan Akun Penagihan ke project target" />
              <ManualStep num={4} title="Create Key" desc="Buat API Key di menu Credentials" />
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-8">
              {step === 0 && (
                <div className="text-center py-10">
                  <div className="w-20 h-20 bg-blue-600/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
                    <i className="fab fa-google text-4xl text-blue-500"></i>
                  </div>
                  <h4 className="text-xl font-black text-white italic uppercase tracking-tighter mb-4">Google Identity Link</h4>
                  <div ref={google_button_ref} className="flex justify-center mb-6"></div>
                  <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Login untuk memulai otomatisasi resource</p>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Project Name</label>
                     <input type="text" value={form_data.project_name} onChange={e => set_form_data({...form_data, project_name: e.target.value})} className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-2 ring-blue-500/50" placeholder="e.g. My-Production-Studio" />
                   </div>
                   <button onClick={() => set_step(2)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-xs transition-all">Continue to Tax Data</button>
                </div>
              )}
              {step >= 2 && <p className="text-center text-slate-500 py-10">Form penagihan berlanjut di sini sesuai data sebelumnya...</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Settings;
