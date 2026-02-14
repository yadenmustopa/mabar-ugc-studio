
import React, { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { mabarApi } from './services/mabarService';
import GenerateContent from './pages/GenerateContent';
import NotAuthorized from './pages/NotAuthorized';
import Settings from './pages/Settings';
import UsageGuide from './pages/UsageGuide';
import { User } from './types';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import { USING_DUMMY_DATA } from './constants';
import { showToast } from './utils';
import FrameCaptureTest from "./pages/FrameCaptureTest";
import GenerateSceneImage from "@/pages/GenerateSceneImage";

const App: React.FC = () => {
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
  const [is_loading, set_is_loading] = useState(!user_profile);
  const [is_key_selected, set_is_key_selected] = useState<boolean>(false);
  const [api_key_hint, set_api_key_hint] = useState<string>('');
  const [api_key_label, set_api_key_label] = useState<string>('');
  const [is_sidebar_open, set_is_sidebar_open] = useState(false);

  const update_key_status = useCallback(async () => {
    const manual_key = localStorage.getItem('api_key_override') || localStorage.getItem('api_key');
    if (manual_key) {
      set_is_key_selected(true);
      set_api_key_hint(manual_key.slice(-4));
      set_api_key_label(localStorage.getItem('manual_key_label') || 'Active Key');
    }
  }, []);

  const check_auth = useCallback(async (show_success_toast = false) => {
    const token = localStorage.getItem('token-mabar');
    if (!USING_DUMMY_DATA && !token) {
      set_user_profile(null);
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
      if (error.response?.status === 401) {
        localStorage.removeItem('token-mabar');
        localStorage.removeItem('user-mabar');
        set_user_profile(null);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    update_key_status();
    check_auth();
  }, [update_key_status]);

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
                <Route path="/guide" element={user_profile ? <UsageGuide /> : <Navigate to="/not-authorized" replace />} />
                <Route path="/scene-image" element={user_profile ? <GenerateSceneImage /> : <Navigate to="/not-authorized" replace />} />
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
