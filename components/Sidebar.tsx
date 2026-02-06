
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  is_open: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ is_open, onClose }) => {
  const location = useLocation();

  const menu_items = [
    { path: '/', icon: 'fas fa-magic', label: 'Generate Video' },
    { path: '/history', icon: 'fas fa-history', label: 'History' },
    { path: '/assets', icon: 'fas fa-folder-open', label: 'Asset Library' },
    { path: '/settings', icon: 'fas fa-cog', label: 'Settings' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {is_open && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" 
          onClick={onClose}
        ></div>
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 w-64 bg-slate-800 border-r border-slate-700 z-50 md:z-auto
        transform transition-transform duration-300 ease-in-out shrink-0 flex flex-col py-6
        ${is_open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex md:hidden items-center justify-between px-6 mb-8">
          <span className="text-lg font-bold text-white italic">MABAR <span className="text-blue-500 underline">STUDIO</span></span>
          <button onClick={onClose} className="text-slate-400 w-8 h-8 flex items-center justify-center hover:text-white transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-4 overflow-y-auto custom-scrollbar">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 px-3">Studio Menu</p>
          {menu_items.map((item) => {
            const is_active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => { if(window.innerWidth < 768) onClose(); }}
                className={`flex items-center space-x-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                  is_active 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                }`}
              >
                <i className={`${item.icon} w-5 text-sm`}></i>
                <span className="font-bold text-xs uppercase tracking-widest">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 mt-auto">
          <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-700/50">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">System Load</p>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2 overflow-hidden">
              <div className="bg-blue-500 h-full w-[45%] rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
            </div>
            <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-widest">
              <span>Stable Mode</span>
              <span>45%</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
