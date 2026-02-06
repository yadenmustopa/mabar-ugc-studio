
import React, { useState, useEffect } from 'react';
import { mabarApi } from '../services/mabarService';
import { showToast } from '../utils';

interface NotAuthorizedProps {
  onAuthUpdate: () => void;
}

const NotAuthorized: React.FC<NotAuthorizedProps> = ({ onAuthUpdate }) => {
  const [token_input, set_token_input] = useState('');
  const [machine_id_input, set_machine_id_input] = useState('');
  const [is_validating, setIs_validating] = useState(false);

  useEffect(() => {
    const saved_token = localStorage.getItem('token-mabar');
    const saved_machine = localStorage.getItem('machine_id');
    if (saved_token) set_token_input(saved_token);
    if (saved_machine) set_machine_id_input(saved_machine);
  }, []);

  const handle_validate = async () => {
    if (!token_input.trim() || !machine_id_input.trim()) {
      showToast("Silakan masukkan Token dan Machine ID", "warning");
      return;
    }

    setIs_validating(true);
    localStorage.setItem('token-mabar', token_input.trim());
    localStorage.setItem('machine_id', machine_id_input.trim());

    try {
      await mabarApi.checkAuth();
      showToast("Kredensial valid! Membuka studio...", "success");
      setTimeout(() => onAuthUpdate(), 500);
    } catch (err: any) {
      // Prioritaskan pesan spesifik dari backend
      const error_msg = err.response?.data?.message || err.message || "Gagal memverifikasi kredensial";
      showToast(error_msg, "error");
      
      if (err.response?.status === 401) {
        localStorage.removeItem('token-mabar');
        localStorage.removeItem('machine_id');
      }
    } finally {
      setIs_validating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-slate-950">
      <div className="w-full max-w-md bg-slate-900 border border-white/5 rounded-[2.5rem] p-12 shadow-2xl">
        <div className="bg-rose-500/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-rose-500/20">
          <i className="fas fa-lock text-3xl text-rose-500"></i>
        </div>
        <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic mb-4">Akses Terbatas</h2>
        <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium">Masukan kredensial Mabar Studio Anda di bawah ini.</p>
        <div className="space-y-4 mb-8 text-left">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Token UGC APP</label>
            <input type="password" placeholder="Masukkan token..." className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono" value={token_input} onChange={(e) => set_token_input(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Machine ID Target</label>
            <input type="text" placeholder="Masukkan machine id..." className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono" value={machine_id_input} onChange={(e) => set_machine_id_input(e.target.value)} />
          </div>
        </div>
        <button onClick={handle_validate} disabled={is_validating} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl uppercase tracking-widest transition-all">
          {is_validating ? <i className="fas fa-circle-notch fa-spin"></i> : <span>Mulai Aplikasi</span>}
        </button>
      </div>
    </div>
  );
};

export default NotAuthorized;
