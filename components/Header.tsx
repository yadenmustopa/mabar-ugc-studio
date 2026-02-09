
import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';
import { showToast } from '../utils';

interface HeaderProps {
  user: User | null;
  is_key_selected: boolean;
  key_hint?: string;
  key_label?: string;
  onToggleSidebar: () => void;
  refreshKeyStatus: () => Promise<void>;
  onAuthUpdate: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  user, 
  is_key_selected, 
  key_hint, 
  key_label, 
  onToggleSidebar, 
  refreshKeyStatus,
  onAuthUpdate
}) => {
  const [active_dropdown, set_active_dropdown] = useState<'key' | 'profile' | null>(null);
  const [show_manual_input, set_show_manual_input] = useState(false);
  
  const [manual_key_name, set_manual_key_name] = useState(localStorage.getItem('manual_key_label') || '');
  const [manual_api_key, set_manual_api_key] = useState(localStorage.getItem('api_key_override') || '');
  const [sync_token, set_sync_token] = useState(localStorage.getItem('token-mabar') || '');
  const [sync_machine, set_sync_machine] = useState(localStorage.getItem('machine_id') || '');

  const dropdown_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle_click_outside = (event: MouseEvent) => {
      if (dropdown_ref.current && !dropdown_ref.current.contains(event.target as Node)) {
        set_active_dropdown(null);
        set_show_manual_input(false);
      }
    };
    document.addEventListener('mousedown', handle_click_outside);
    return () => document.removeEventListener('mousedown', handle_click_outside);
  }, []);

  const handle_native_switch = async () => {
    const ai_studio = (window as any).aistudio;
    if (ai_studio?.openSelectKey) {
      localStorage.removeItem('api_key_override');
      localStorage.removeItem('manual_key_label');
      set_active_dropdown(null);
      try {
        await ai_studio.openSelectKey();
        setTimeout(() => {
          refreshKeyStatus();
        }, 500);
      } catch (err) {
        console.error("Gagal membuka pemilih key", err);
      }
    }
  };

  const handle_save_manual_key = async () => {
    if (!manual_api_key.trim() || !manual_key_name.trim()) {
      showToast("Data key manual wajib diisi", "warning");
      return;
    }
    localStorage.setItem('api_key_override', manual_api_key.trim());
    localStorage.setItem('manual_key_label', manual_key_name.trim());
    showToast("Key Manual Disimpan", "success");
    await refreshKeyStatus();
    set_show_manual_input(false);
    set_active_dropdown(null);
  };

  const handle_save_creds = () => {
    localStorage.setItem('token-mabar', sync_token);
    localStorage.setItem('machine_id', sync_machine);
    onAuthUpdate(); // Reactive update tanpa reload
    set_active_dropdown(null);
  };

  const handle_logout = () => {
    localStorage.removeItem('token-mabar');
    localStorage.removeItem('user-mabar');
    localStorage.removeItem('machine_id');
    onAuthUpdate(); // Reset state aplikasi secara instan
    set_active_dropdown(null);
    showToast("Berhasil keluar dari studio", "info");
  };

  const is_manual = !!localStorage.getItem('api_key_override');
  const has_any_key = is_manual || is_key_selected;
  
  const display_label = is_manual 
    ? (localStorage.getItem('manual_key_label') || 'Manual Override') 
    : (is_key_selected ? (key_label || 'Generative Project') : 'Belum Terdeteksi');
  
  const display_hint = is_manual 
    ? manual_api_key.slice(-4) 
    : (is_key_selected ? key_hint : '');

  const prevent_close = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <header className="bg-slate-900 border-b border-white/5 h-20 flex items-center justify-between px-6 z-50 relative shadow-2xl" ref={dropdown_ref}>
      <div className="flex items-center space-x-4">
        {user && (
          <button onClick={onToggleSidebar} className="md:hidden text-slate-400 hover:text-white p-2 transition-colors">
            <i className="fas fa-bars"></i>
          </button>
        )}
        
        <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => window.location.hash = '#/'}>
          <div className="bg-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/50 group-hover:scale-105 transition-transform">
            <i className="fas fa-video text-white text-xl"></i>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-black text-white tracking-tighter uppercase italic leading-none mb-1">Mabar <span className="text-blue-500">UGC</span></h1>
            <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.2em]">Studio Pipeline v1.2</p>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/*<div className="relative">*/}
        {/*  <button */}
        {/*    onClick={() => {*/}
        {/*      set_active_dropdown(active_dropdown === 'key' ? null : 'key');*/}
        {/*      set_show_manual_input(false);*/}
        {/*    }}*/}
        {/*    className={`flex items-center space-x-4 px-5 py-2.5 rounded-xl border transition-all ${active_dropdown === 'key' ? 'bg-slate-800 border-white/20' : 'bg-slate-800/50 border-white/5 hover:border-white/10'}`}*/}
        {/*  >*/}
        {/*    <i className={`fas fa-key text-xs ${has_any_key ? 'text-emerald-500' : 'text-rose-500 animate-pulse'}`}></i>*/}
        {/*    <span className={`text-[10px] font-black uppercase tracking-widest ${has_any_key ? 'text-slate-100' : 'text-rose-400'}`}>*/}
        {/*      {has_any_key ? `GEMINI KEY : ....${display_hint || '???'}` : 'BELUM ADA GEMINI KEY'}*/}
        {/*    </span>*/}
        {/*    <i className="fas fa-chevron-down text-[8px] opacity-40"></i>*/}
        {/*  </button>*/}

        {/*  {active_dropdown === 'key' && (*/}
        {/*    <div */}
        {/*      onClick={prevent_close}*/}
        {/*      className="absolute top-full right-0 mt-3 w-80 bg-slate-800 border border-white/10 rounded-2xl shadow-3xl p-6 z-50 animate-in fade-in slide-in-from-top-2"*/}
        {/*    >*/}
        {/*      <div className="space-y-6">*/}
        {/*        <div>*/}
        {/*          <h5 className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Active Provider</h5>*/}
        {/*          <div className="space-y-4">*/}
        {/*            <div className="space-y-1">*/}
        {/*              <span className="text-[8px] font-black text-slate-600 uppercase">Nama Key :</span>*/}
        {/*              <p className="text-xs font-bold text-white truncate">{display_label}</p>*/}
        {/*            </div>*/}
        {/*            <div className="space-y-1">*/}
        {/*              <span className="text-[8px] font-black text-slate-600 uppercase">Gemini Key :</span>*/}
        {/*              <div className="bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-[11px] font-mono text-slate-400 truncate">*/}
        {/*                {is_manual ? manual_api_key : (is_key_selected ? `••••••••••••${key_hint}` : 'Belum ada key aktif')}*/}
        {/*              </div>*/}
        {/*            </div>*/}
        {/*          </div>*/}
        {/*        </div>*/}

        {/*        <div className="pt-2 border-t border-white/5 space-y-3">*/}
        {/*          {!show_manual_input ? (*/}
        {/*            <>*/}
        {/*              <button onClick={() => set_show_manual_input(true)} className="w-full bg-slate-900 hover:bg-slate-950 border border-white/5 text-white py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2">*/}
        {/*                <i className="fas fa-edit text-blue-500"></i>*/}
        {/*                <span>Pakai Api Key Lain</span>*/}
        {/*              </button>*/}
        {/*              <button onClick={handle_native_switch} className="w-full bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2">*/}
        {/*                <i className="fab fa-google"></i>*/}
        {/*                <span>Pakai Api Akun Ini (Gmail)</span>*/}
        {/*              </button>*/}
        {/*            </>*/}
        {/*          ) : (*/}
        {/*            <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">*/}
        {/*              <div className="space-y-1.5">*/}
        {/*                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left block">Label Key</label>*/}
        {/*                <input type="text" value={manual_key_name} onChange={e => set_manual_key_name(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 ring-blue-500" placeholder="e.g. My Personal Key" />*/}
        {/*              </div>*/}
        {/*              <div className="space-y-1.5">*/}
        {/*                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left block">API Key Value</label>*/}
        {/*                <input type="password" value={manual_api_key} onChange={e => set_manual_api_key(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-lg px-3 py-2 text-xs text-white outline-none focus:ring-1 ring-blue-500 font-mono" placeholder="AIza..." />*/}
        {/*              </div>*/}
        {/*              <div className="grid grid-cols-2 gap-3">*/}
        {/*                <button onClick={() => set_show_manual_input(false)} className="bg-slate-700 hover:bg-slate-600 py-2.5 rounded-lg text-[9px] font-black uppercase text-white transition-all">Batal</button>*/}
        {/*                <button onClick={handle_save_manual_key} className="bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg text-[9px] font-black uppercase text-white transition-all shadow-lg shadow-blue-600/20">Simpan</button>*/}
        {/*              </div>*/}
        {/*            </div>*/}
        {/*          )}*/}
        {/*        </div>*/}
        {/*      </div>*/}
        {/*    </div>*/}
        {/*  )}*/}
        {/*</div>*/}

        <div className="relative">
          <button 
            onClick={() => set_active_dropdown(active_dropdown === 'profile' ? null : 'profile')}
            className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 overflow-hidden ring-2 ring-slate-950 shadow-xl active:scale-95 transition-transform"
          >
            <img src={user ? `https://picsum.photos/seed/${user.id}/100` : `https://picsum.photos/seed/guest/100`} alt="Avatar" className="w-full h-full object-cover" />
          </button>
          
          {active_dropdown === 'profile' && (
            <div 
              onClick={prevent_close}
              className="absolute top-full right-0 mt-3 w-80 bg-slate-800 border border-white/10 rounded-2xl shadow-3xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2"
            >
              {user ? (
                <div className="p-6 bg-slate-900/50">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3">Login Studio Session</p>
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 border border-white/10 overflow-hidden shadow-inner">
                      <img src={`https://picsum.photos/seed/${user.id}/100`} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate italic">{user.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[7px] font-black text-blue-400 uppercase tracking-widest">
                        {user.role}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 bg-rose-500/10 border-b border-rose-500/20 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center mx-auto border border-rose-500/30">
                    <i className="fas fa-user-slash text-rose-500 text-lg"></i>
                  </div>
                  <p className="text-[11px] font-black text-rose-400 uppercase tracking-[0.1em] leading-relaxed">
                    Silahkan Masukan Terlebih dahulu Token Ugc Dan Machine ID
                  </p>
                </div>
              )}

              <div className="px-6 py-5 border-t border-white/5 bg-slate-800/50">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center">
                  <i className="fas fa-cog mr-2 text-blue-500"></i>
                  UPDATE TOKEN UGC APP & MACHINE
                </h4>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 block text-left">Token Mabar</span>
                    <input type="password" value={sync_token} onChange={e => set_sync_token(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-2 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all font-mono" placeholder="Masukkan Token UGC..." />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1 block text-left">Machine ID Target</span>
                    <input type="text" value={sync_machine} onChange={e => set_sync_machine(e.target.value)} className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-2 text-xs text-white outline-none focus:ring-1 ring-blue-500 transition-all font-mono" placeholder="Masukkan Machine ID..." />
                  </div>
                  <button onClick={handle_save_creds} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-98">
                    Simpan Identitas
                  </button>
                </div>
              </div>
              
              {user && (
                <div className="p-2 border-t border-white/5 bg-slate-900/30">
                  <button 
                    onClick={handle_logout}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all text-left group"
                  >
                    <i className="fas fa-sign-out-alt text-xs group-hover:translate-x-1 transition-transform"></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">Keluar Studio</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
