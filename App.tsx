
import React, { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { mabarApi } from './services/mabarService';
import GenerateContent from './pages/GenerateContent';
import NotAuthorized from './pages/NotAuthorized';
import Settings from './pages/Settings';
import { User } from './types';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import { USING_DUMMY_DATA } from './constants';
import { showToast } from './utils';
import FrameCaptureTest from "./pages/FrameCaptureTest";

declare const google: any;

const GOOGLE_CLIENT_ID = "47005254759-dgl4i9gs2jk815fc4nm7booa3fbskou6.apps.googleusercontent.com";

const App: React.FC = () => {
  // Inisialisasi state user secara sinkron dari localStorage
  const [user_profile, set_user_profile] = useState<User | null>(() => {
    const saved_user = localStorage.getItem('user-mabar');
    const token = localStorage.getItem('token-mabar');
    if (!token) return null;
    try {
      return saved_user ? JSON.parse(saved_user) : null;
    } catch {
      return null;
    }
  });

  const [google_id_token, set_google_id_token] = useState<string | null>(null);
  const [is_loading, set_is_loading] = useState(!user_profile); // Loading hanya jika cache kosong
  const [is_key_selected, set_is_key_selected] = useState<boolean>(false);
  const [api_key_hint, set_api_key_hint] = useState<string>('');
  const [api_key_label, set_api_key_label] = useState<string>('');
  const [is_sidebar_open, set_is_sidebar_open] = useState(false);

  const getAiStudio = () => (window as any).aistudio;

  const update_key_status = useCallback(async () => {
    const manual_key = localStorage.getItem('api_key_override');
    if (manual_key) {
      set_is_key_selected(true);
      set_api_key_hint(manual_key.slice(-4));
      set_api_key_label(localStorage.getItem('manual_key_label') || 'Manual Key');
      return;
    }

    const ai_studio = getAiStudio();
    if (ai_studio?.hasSelectedApiKey) {
      try {
        const has_key = await ai_studio.hasSelectedApiKey();
        set_is_key_selected(has_key);

        if (has_key && process.env.API_KEY) {
          const full_key = process.env.API_KEY;
          set_api_key_hint(full_key.slice(-4));
          try {
            const remote_keys = await mabarApi.getApiKeys();
            const matched_key = remote_keys.find(k => full_key.startsWith(k.key_prefix));
            set_api_key_label(matched_key ? matched_key.label : 'Generative Project');
          } catch (e) {
            set_api_key_label('Generative Project');
          }
        } else {
          set_api_key_hint('');
          set_api_key_label('Belum Terdeteksi');
        }
      } catch (err) {
        set_is_key_selected(false);
      }
    } else {
      set_is_key_selected(!!process.env.API_KEY);
      set_api_key_hint(process.env.API_KEY ? process.env.API_KEY.slice(-4) : '');
      set_api_key_label('Developer Sandbox');
    }
  }, []);

  const handle_google_callback = useCallback((response: any) => {
    if (response.credential) {
      set_google_id_token(response.credential);
      showToast("Identity Verified", "success");
    }
  }, []);

  const init_google_identity = useCallback(() => {
    if (typeof google !== 'undefined' && GOOGLE_CLIENT_ID) {
      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handle_google_callback,
          auto_select: false,
          ux_mode: 'popup'
        });
      } catch (err) { console.error(err); }
    }
  }, [handle_google_callback]);

  const check_auth = useCallback(async (show_success_toast = false) => {
    const token = localStorage.getItem('token-mabar');

    if (!USING_DUMMY_DATA && !token) {
      set_user_profile(null);
      localStorage.removeItem('user-mabar');
      set_is_loading(false);
      return;
    }

    try {
      const user_data = await mabarApi.checkAuth();
      if (user_data) {
        set_user_profile(user_data);
        localStorage.setItem('user-mabar', JSON.stringify(user_data));
        if (show_success_toast) showToast(`Selamat datang kembali, ${user_data.name}`, "success");
      }
    } catch (error: any) {
      console.error("[App] Auth Verification Failed:", error);

      // Hanya hapus kredensial jika error adalah 401 (Unauthorized)
      // Jika error network/tunnel ngrok, tetap biarkan user masuk menggunakan cache
      if (error.response?.status === 401) {
        localStorage.removeItem('token-mabar');
        localStorage.removeItem('user-mabar');
        localStorage.removeItem('machine_id');
        set_user_profile(null);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    update_key_status();
    check_auth();
    const check_google = setInterval(() => {
      if (typeof google !== 'undefined') {
        init_google_identity();
        clearInterval(check_google);
      }
    }, 500);
    return () => clearInterval(check_google);
  }, [init_google_identity, update_key_status, check_auth]);

  if (is_loading) {
    return (
        <div className="flex items-center justify-center h-screen bg-slate-950">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        </div>
    );
  }

  return (
      <HashRouter>
        <div className="flex flex-col h-screen overflow-hidden bg-slate-950">
          <Header
              user={user_profile}
              is_key_selected={is_key_selected}
              key_hint={api_key_hint}
              key_label={api_key_label}
              onToggleSidebar={() => set_is_sidebar_open(!is_sidebar_open)}
              refreshKeyStatus={update_key_status}
              onAuthUpdate={() => check_auth(true)}
          />
          <div className="flex flex-1 overflow-hidden relative">
            {user_profile && (
                <Sidebar is_open={is_sidebar_open} onClose={() => set_is_sidebar_open(false)} />
            )}

            <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/30 w-full">
              <Routes>
                <Route path="/" element={user_profile ? <GenerateContent /> : <Navigate to="/not-authorized" replace />} />
                <Route path="/settings" element={user_profile ? <Settings user_email={user_profile.email} google_id_token={google_id_token} /> : <Navigate to="/not-authorized" replace />} />
                <Route path="/not-authorized" element={user_profile ? <Navigate to="/" replace /> : <NotAuthorized onAuthUpdate={() => check_auth(true)} />} />
                <Route path="/capture-test" element={<FrameCaptureTest />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
          <Footer />
        </div>
      </HashRouter>
  );
};

export default App;
