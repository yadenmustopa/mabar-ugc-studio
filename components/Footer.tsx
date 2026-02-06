
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-800 border-t border-slate-700 py-3 px-6 flex justify-between items-center shrink-0">
      <div className="flex items-center space-x-2">
        <span className="text-xs text-slate-500">© 2025</span>
        <span className="text-xs font-bold text-slate-400">RootIndo X Bharata Mabar</span>
      </div>
      <div className="flex space-x-4">
        <a href="#" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Documentation</a>
        <a href="#" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Support</a>
        <span className="text-xs text-slate-600">v1.2.0-beta</span>
      </div>
    </footer>
  );
};

export default Footer;
