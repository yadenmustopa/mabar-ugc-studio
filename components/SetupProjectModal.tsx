
import React, { useState, useEffect, useRef } from 'react';
import { mabarApi } from '../services/mabarService';
import { ApiKey } from '../types';
import { showToast } from '../utils';

declare const google: any;

interface SetupProjectModalProps {
  onClose: () => void;
  onSuccess: (new_key: ApiKey) => void;
  user_email: string;
  google_id_token: string | null;
}

type ModalView = 'selection' | 'automatic' | 'manual';

const SetupProjectModal: React.FC<SetupProjectModalProps> = ({ 
  onClose, 
  onSuccess, 
  user_email, 
  google_id_token
}) => {
  const [view, set_view] = useState<ModalView>('selection');
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

  // Google Identity logic for Automatic mode
  useEffect(() => {
    if (view === 'automatic' && step === 0 && google_button_ref.current && typeof google !== 'undefined') {
      try {
        if (google_button_ref.current) google_button_ref.current.innerHTML = '';
        google.accounts.id.renderButton(
          google_button_ref.current,
          { 
            theme: "filled_blue", 
            size: "large", 
            width: 350, 
            shape: "pill",
            text: "continue_with"
          }
        );
      } catch (err) {
        console.error("[Modal] Failed to render Google button", err);
      }
    }
  }, [view, step]);

  useEffect(() => {
    if (google_id_token && view === 'automatic' && step === 0) {
      set_step(1);
    }
  }, [google_id_token, view, step]);

  const copy_origin = () => {
    navigator.clipboard.writeText(current_origin);
    showToast("Origin copied to clipboard!", "success");
  };

  const handle_finalize_setup = async () => {
    if (!form_data.card_number || form_data.cvv.length < 3) {
      showToast("Invalid card data", "warning");
      return;
    }

    set_is_creating(true);
    set_creation_status("Provisioning Cloud Resources...");

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

      const response = await mabarApi.generateApiKey(payload);
      set_creation_status("Cloud Provisioning Successful!");
      await new Promise(r => setTimeout(r, 1500));
      onSuccess(response);
    } catch (err: any) {
      set_is_creating(false);
      const error_msg = err.response?.data?.message || "Cloud Provisioning Error. Check Google Console.";
      showToast(error_msg, "error");
    }
  };

  const ManualStep = ({ num, title, desc, link, linkLabel }: { num: number, title: string, desc: string, link?: string, linkLabel?: string }) => (
    <div className="flex space-x-4 group">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-black text-blue-400 group-hover:border-blue-500/50 transition-colors">
        {num}
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-black text-white uppercase tracking-tight">{title}</p>
        <p className="text-[10px] text-slate-400 leading-relaxed font-medium">{desc}</p>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-[10px] text-blue-400 hover:text-blue-300 font-bold transition-colors">
            <span>{linkLabel || 'Buka Google Cloud Console'}</span>
            <i className="fas fa-external-link-alt text-[8px]"></i>
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-3xl bg-slate-950/90 overflow-y-auto">
      <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-3xl my-auto animate-in zoom-in-95 duration-300">
        
        {/* Modal Header */}
        <div className="bg-slate-800/80 px-8 py-6 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center space-x-3">
             <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                <i className={`fas ${view === 'manual' ? 'fa-book' : 'fa-magic'} text-white`}></i>
             </div>
             <div>
               <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none mb-1">Project Setup</h3>
               <p className="text-xs font-bold text-white uppercase italic tracking-tighter">
                 {view === 'selection' ? 'Choose Configuration Method' : view === 'manual' ? 'Manual Setup Guide' : `Auto Provisioning • Step ${step} of 3`}
               </p>
             </div>
          </div>
          {!is_creating && (
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        <div className="p-10">
          {is_creating ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="relative w-28 h-28 mb-10">
                <div className="absolute inset-0 border-[6px] border-blue-500/10 rounded-full"></div>
                <div className="absolute inset-0 border-[6px] border-t-blue-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <i className="fas fa-robot text-blue-500 text-3xl animate-pulse"></i>
                </div>
              </div>
              <h4 className="text-xl font-black text-white mb-2 italic uppercase">System Automating...</h4>
              <p className="text-blue-400 text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse bg-blue-500/10 px-4 py-2 rounded-lg">{creation_status}</p>
            </div>
          ) : view === 'selection' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="text-center mb-8">
                  <h4 className="text-white font-black text-2xl italic uppercase tracking-tighter mb-2">Pilih Cara Setup</h4>
                  <p className="text-slate-500 text-xs">Aktifkan Google Cloud Project untuk mengakses model AI Generative.</p>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Automatic Card */}
                 <button 
                  onClick={() => set_view('automatic')}
                  className="group relative bg-slate-950/50 border border-white/5 rounded-[2rem] p-8 text-left hover:border-blue-500/50 transition-all hover:shadow-2xl hover:shadow-blue-500/10 overflow-hidden"
                 >
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                      <i className="fas fa-magic text-6xl"></i>
                    </div>
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-600/20">
                      <i className="fas fa-bolt text-white"></i>
                    </div>
                    <h5 className="text-white font-black text-lg uppercase italic tracking-tighter mb-2">Mode Otomatis</h5>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                      Sistem kami akan membuatkan Project & API Key secara instan menggunakan Google Identity. <span className="text-blue-400">Paling Direkomendasikan.</span>
                    </p>
                 </button>

                 {/* Manual Card */}
                 <button 
                  onClick={() => set_view('manual')}
                  className="group relative bg-slate-950/50 border border-white/5 rounded-[2rem] p-8 text-left hover:border-slate-500 transition-all overflow-hidden"
                 >
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                      <i className="fas fa-book-open text-6xl"></i>
                    </div>
                    <div className="w-12 h-12 bg-slate-800 border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                      <i className="fas fa-tools text-slate-400"></i>
                    </div>
                    <h5 className="text-white font-black text-lg uppercase italic tracking-tighter mb-2">Mode Manual</h5>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                      Jika Anda ingin menggunakan Project Google Cloud yang sudah ada. Ikuti panduan konfigurasi manual kami.
                    </p>
                 </button>
               </div>
            </div>
          ) : view === 'manual' ? (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-black text-xl italic uppercase tracking-tighter">Panduan Setup Manual (VEO)</h4>
                <button onClick={() => set_view('selection')} className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest border-b border-slate-700">Kembali</button>
              </div>

              <div className="bg-slate-950/50 border border-white/5 rounded-3xl p-8 space-y-6 overflow-y-auto max-h-[450px] custom-scrollbar">
                <ManualStep 
                  num={1} 
                  title="Masuk ke Google Cloud Console" 
                  desc="Buka Cloud Console dan login dengan akun Google Anda."
                  link="https://console.cloud.google.com/"
                />
                <ManualStep 
                  num={2} 
                  title="Pilih atau Buat Project" 
                  desc="Pilih project target atau buat project baru jika belum punya."
                  link="https://console.cloud.google.com/projectselector2/home/dashboard"
                  linkLabel="Create Project"
                />
                <ManualStep 
                  num={3} 
                  title="Buka Halaman Penagihan (Billing)" 
                  desc="Di menu kiri, klik 'Billing'. Pastikan akun penagihan sudah aktif."
                  link="https://console.cloud.google.com/billing"
                  linkLabel="Buka Billing"
                />
                <ManualStep 
                  num={4} 
                  title="Buka Account Management" 
                  desc="Pilih Nama Project dan pilih 'Change billing account' jika perlu menghubungkan akun penagihan yang sudah ada."
                  link="https://console.cloud.google.com/billing/projects"
                  linkLabel="Kelola Project Billing"
                />
                <ManualStep 
                  num={5} 
                  title="Aktifkan Gemini API" 
                  desc="Cari 'Gemini API' di search bar atas atau klik link di bawah dan tekan 'Enable' (Aktifkan)."
                  link="https://console.cloud.google.com/marketplace/product/google/generativelanguage.googleapis.com"
                  linkLabel="Aktifkan Gemini API"
                />
                <ManualStep 
                  num={6} 
                  title="Verifikasi Penagihan" 
                  desc="Pastikan status penagihan di halaman Billing sudah hijau/aktif untuk project tersebut."
                />
                <ManualStep 
                  num={7} 
                  title="Selesai" 
                  desc="Kembali ke aplikasi ini dan gunakan tombol 'Ganti Project' di Header untuk memasukkan API Key yang sudah Anda buat."
                />
              </div>

              <button 
                onClick={onClose}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-xs transition-all shadow-xl shadow-blue-600/10"
              >
                Tutup Panduan
              </button>
            </div>
          ) : (
            /* Automatic Mode Flows (Steps 0-3) */
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
               {step === 0 && (
                 <div className="space-y-8 text-center">
                    <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                      <i className="fab fa-google text-3xl text-blue-500"></i>
                    </div>
                    <h4 className="text-white font-black text-2xl italic uppercase tracking-tight">Verified Access</h4>
                    <p className="text-slate-400 text-sm max-w-sm mx-auto">Kami akan membantu memprovisi project baru secara otomatis melalui akun Google Anda.</p>
                    <div ref={google_button_ref} className="w-full flex justify-center min-h-[50px]"></div>
                    <div className="mt-8 p-6 bg-slate-950 border border-white/5 rounded-[2rem] text-left space-y-4 w-full">
                       <p className="text-[9px] text-slate-500 leading-relaxed">
                         Jika muncul error mismatch, tambahkan URL ini ke <span className="text-blue-400 italic">Authorized JavaScript Origins</span> di Google Console:
                       </p>
                       <div className="flex items-center space-x-2 bg-black/40 p-3 rounded-xl border border-white/5">
                          <code className="text-emerald-400 text-[10px] font-mono break-all flex-1">{current_origin}</code>
                          <button onClick={copy_origin} className="text-slate-500 hover:text-white transition-colors"><i className="fas fa-copy text-xs"></i></button>
                       </div>
                    </div>
                    <button onClick={() => set_view('selection')} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white underline decoration-slate-800">Ganti Metode Setup</button>
                 </div>
               )}

               {step === 1 && (
                 <div className="space-y-6">
                    <h4 className="text-white font-black text-2xl mb-1 italic tracking-tight uppercase">Cloud Project Identity</h4>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nama Project Baru</label>
                      <input type="text" placeholder="e.g. My-UGC-Studio-Project" className="w-full bg-slate-950 border border-white/5 rounded-2xl px-6 py-4 text-white font-bold outline-none focus:ring-2 ring-blue-500/50" value={form_data.project_name} onChange={e => set_form_data({...form_data, project_name: e.target.value})}/>
                    </div>
                    <button onClick={() => set_step(2)} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-xs">Lanjutkan ke Data Pajak</button>
                 </div>
               )}

               {step === 2 && (
                 <div className="space-y-6">
                    <h4 className="text-white font-black text-xl mb-1 italic uppercase">Tax & Compliance</h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">NIK (16 Digit)</label>
                        <input type="text" maxLength={16} placeholder="320..." className="w-full bg-slate-950 border border-white/5 rounded-xl px-5 py-3 text-white font-mono tracking-widest outline-none" value={form_data.nik} onChange={e => set_form_data({...form_data, nik: e.target.value.replace(/\D/g, '')})}/>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Alamat Penagihan</label>
                        <input type="text" placeholder="Alamat lengkap..." className="w-full bg-slate-950 border border-white/5 rounded-xl px-5 py-3 text-white outline-none" value={form_data.address} onChange={e => set_form_data({...form_data, address: e.target.value})}/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Kota" className="bg-slate-950 border border-white/5 rounded-xl px-5 py-3 text-white outline-none" value={form_data.city} onChange={e => set_form_data({...form_data, city: e.target.value})}/>
                        <input type="text" placeholder="Zip" className="bg-slate-950 border border-white/5 rounded-xl px-5 py-3 text-white outline-none" value={form_data.postal_code} onChange={e => set_form_data({...form_data, postal_code: e.target.value.replace(/\D/g, '')})}/>
                      </div>
                    </div>
                    <div className="flex space-x-3 mt-8">
                      <button onClick={() => set_step(1)} className="flex-1 bg-slate-800 text-slate-400 font-bold py-4 rounded-2xl uppercase tracking-widest text-[10px]">Back</button>
                      <button onClick={() => set_step(3)} className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-2xl uppercase tracking-widest text-[10px]">Next: Billing</button>
                    </div>
                 </div>
               )}

               {step === 3 && (
                 <div className="space-y-6">
                    <h4 className="text-white font-black text-xl italic uppercase">Payment Method</h4>
                    <div className="space-y-4">
                      <input type="text" placeholder="NAME ON CARD" className="w-full bg-slate-950 border border-white/5 rounded-xl px-5 py-3 text-white outline-none uppercase font-black text-xs tracking-widest" value={form_data.card_name} onChange={e => set_form_data({...form_data, card_name: e.target.value})}/>
                      <input type="text" placeholder="0000 0000 0000 0000" className="w-full bg-slate-950 border border-white/5 rounded-xl px-5 py-3 text-white outline-none font-mono text-lg" value={form_data.card_number} onChange={e => set_form_data({...form_data, card_number: e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()})}/>
                      <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="MM/YY" maxLength={5} className="w-full bg-slate-950 border border-white/5 rounded-xl px-5 py-3 text-white outline-none font-mono" value={form_data.expiry} onChange={e => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2, 4);
                            set_form_data({...form_data, expiry: val});
                        }}/>
                        <input type="password" placeholder="CVV" maxLength={4} className="w-full bg-slate-950 border border-emerald-500/20 rounded-xl px-5 py-3 text-white outline-none font-mono tracking-[0.8em]" value={form_data.cvv} onChange={e => set_form_data({...form_data, cvv: e.target.value.replace(/\D/g, '')})}/>
                      </div>
                    </div>
                    <div className="flex space-x-3 mt-8">
                      <button onClick={() => set_step(2)} className="flex-1 bg-slate-800 text-slate-400 font-bold py-4 rounded-2xl uppercase tracking-widest text-[10px]">Back</button>
                      <button onClick={handle_finalize_setup} className="flex-[2] bg-emerald-600 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/20">START PROVISIONING</button>
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupProjectModal;
