
import React from 'react';

const UsageGuide: React.FC = () => {
    const requirements = [
        {
            title: "1. Google Cloud Billing",
            icon: "fas fa-credit-card",
            color: "blue",
            desc: "Langkah terpenting: Akun GCP Anda harus memiliki Billing yang AKTIF.",
            link: "https://console.cloud.google.com/billing",
            action: "Setup Billing Sekarang",
            steps: [
                "Pastikan ada kartu Kredit/Debit terhubung.",
                "Status akun penagihan harus berwarna hijau (Active).",
                "Jika muncul banner 'Suspicious Activity', wajib klik 'Fix Now' dan ikuti verifikasi kartu.",
                "Update NIK di menu Tax Info agar sesuai standar DGT Indonesia."
            ]
        },
        {
            title: "2. Activate Gemini API",
            icon: "fas fa-bolt",
            color: "emerald",
            desc: "Secara default, layanan API ini dalam kondisi non-aktif di project baru.",
            link: "https://console.cloud.google.com/marketplace/product/google/generativelanguage.googleapis.com",
            action: "Aktifkan Layanan API",
            steps: [
                "Klik tombol 'Enable' pada link di atas.",
                "Status harus berubah menjadi 'API Enabled'.",
                "Tanpa aktivasi manual, sistem akan terus memberikan error 403 Permission Denied.",
                "Pastikan project yang dipilih sama dengan project billing Anda."
            ]
        },
        {
            title: "3. API Key & Restrictions",
            icon: "fas fa-key",
            color: "amber",
            desc: "Gunakan API Key yang benar dan tidak dibatasi secara salah.",
            link: "https://console.cloud.google.com/apis/credentials",
            action: "Manage Credentials",
            steps: [
                "Buat 'API Key' baru di menu Credentials.",
                "Di bagian 'API Restrictions', pilih 'Restrict Key'.",
                "Centang hanya 'Generative Language API'.",
                "Copy & Paste key tersebut ke aplikasi Mabar Studio melalui menu Settings."
            ]
        }
    ];

    const criticalChecklist = [
        { label: "Status Project", value: "Paid / Active", sub: "Bukan 'Free Trial Over'", icon: "fas fa-check-circle" },
        { label: "Verifikasi Identitas", value: "Completed", sub: "KTP & Kartu Fisik sudah diverifikasi", icon: "fas fa-id-card" },
        { label: "API Enabled", value: "Generative Language", sub: "Status: Enabled", icon: "fas fa-microchip" }
    ];

    const commonErrors = [
        {
            code: "403 PERMISSION_DENIED",
            reason: "Ini bukan error aplikasi. Ini berarti Billing GCP Anda mati, API belum di-enable, atau Anda belum klik 'Fix Now' pada banner merah di GCP Console.",
            solution: "Buka Billing GCP, selesaikan verifikasi kartu & identitas."
        },
        {
            code: "429 TOO_MANY_REQUESTS",
            reason: "Anda menggunakan kuota gratis (Free Tier) dan sudah habis.",
            solution: "Tunggu beberapa menit atau hubungkan Billing ke project berbayar."
        },
        {
            code: "RAI_FILTERED",
            reason: "Permintaan Anda ditolak oleh filter keamanan Google (Konten sensitif/tokoh publik).",
            solution: "Ganti prompt visual agar lebih umum dan aman."
        }
    ];

    return (
        <div className="p-8 md:p-12 max-w-6xl mx-auto space-y-12 animate-in fade-in duration-500 pb-20">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <i className="fas fa-graduation-cap text-white text-sm"></i>
                        </div>
                        <h2 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] leading-none">Masterclass Onboarding</h2>
                    </div>
                    <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">GCP <span className="text-blue-500">Requirements</span> Guide</h1>
                    <p className="text-slate-400 font-medium max-w-xl text-xs leading-relaxed">
                        90% kendala user (Error 403) disebabkan oleh konfigurasi Google Cloud yang tidak lengkap. Ikuti panduan visual di bawah ini untuk mengaktifkan Studio Anda.
                    </p>
                </div>
                <div className="flex space-x-4">
                    <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-3 shadow-2xl shadow-rose-600/20 group">
                        <i className="fas fa-play group-hover:scale-110 transition-transform"></i>
                        <span>Full Video Tutorial</span>
                    </a>
                </div>
            </header>

            {/* Checklist Utama */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {criticalChecklist.map((item, idx) => (
                    <div key={idx} className="bg-slate-900/30 border border-white/5 rounded-3xl p-6 flex items-center space-x-5 backdrop-blur-md">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-blue-500 border border-white/5 shadow-inner">
                            <i className={item.icon}></i>
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{item.label}</p>
                            <p className="text-xs font-black text-white uppercase italic leading-none">{item.value}</p>
                            <p className="text-[9px] text-slate-500 font-bold mt-1">{item.sub}</p>
                        </div>
                    </div>
                ))}
            </section>

            {/* Step by Step Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {requirements.map((req, idx) => (
                    <div key={idx} className="bg-slate-900/50 border border-white/5 rounded-[2.5rem] p-8 flex flex-col shadow-2xl backdrop-blur-md relative overflow-hidden group">
                        <div className={`absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity`}>
                            <i className={`${req.icon} text-7xl`}></i>
                        </div>

                        <div className={`w-12 h-12 bg-${req.color}-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl ring-4 ring-${req.color}-500/10`}>
                            <i className={`${req.icon} text-white text-xl`}></i>
                        </div>

                        <h3 className="text-lg font-black text-white italic uppercase tracking-tighter mb-3">{req.title}</h3>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-6">{req.desc}</p>

                        <div className="flex-1 space-y-4 mb-8">
                            {req.steps.map((step, sIdx) => (
                                <div key={sIdx} className="flex items-start space-x-3">
                                    <div className="w-5 h-5 rounded-full bg-slate-800 border border-white/10 flex-shrink-0 flex items-center justify-center text-[8px] font-black text-blue-400">{sIdx + 1}</div>
                                    <p className="text-[10px] text-slate-300 font-bold leading-relaxed">{step}</p>
                                </div>
                            ))}
                        </div>

                        <a
                            href={req.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`w-full bg-slate-950 hover:bg-white/5 border border-white/10 text-white py-4 rounded-2xl text-[9px] font-black uppercase tracking-widest text-center transition-all flex items-center justify-center space-x-2 group-hover:border-blue-500/30 shadow-inner`}
                        >
                            <span>{req.action}</span>
                            <i className="fas fa-external-link-alt opacity-40 text-[8px]"></i>
                        </a>
                    </div>
                ))}
            </div>

            {/* Troubleshooting Section - High Visibility */}
            <section className="bg-slate-950 border border-rose-500/20 rounded-[2.5rem] p-10 backdrop-blur-xl relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-10 opacity-5">
                    <i className="fas fa-tools text-8xl text-rose-500"></i>
                </div>
                <div className="flex items-center space-x-4 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-rose-600/10 border border-rose-500/20 flex items-center justify-center">
                        <i className="fas fa-exclamation-triangle text-rose-500"></i>
                    </div>
                    <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Technical Troubleshooting (Error Handling)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {commonErrors.map((err, idx) => (
                        <div key={idx} className="bg-slate-900/50 border border-white/5 p-6 rounded-3xl space-y-4 hover:border-white/10 transition-colors">
                            <div>
                                <p className="text-rose-500 font-mono text-[11px] font-black uppercase tracking-wider mb-1">{err.code}</p>
                                <div className="h-0.5 w-8 bg-rose-500/30 rounded-full"></div>
                            </div>
                            <p className="text-slate-200 text-[10px] font-bold leading-relaxed">{err.reason}</p>
                            <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl">
                                <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">Solution:</p>
                                <p className="text-[9px] text-emerald-400/80 font-medium italic">{err.solution}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-10 p-8 bg-blue-600/5 border border-blue-500/20 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-600/5 animate-pulse pointer-events-none"></div>
                    <div className="flex items-center space-x-5 relative z-10">
                        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-600/20">
                            <i className="fas fa-headset text-xl"></i>
                        </div>
                        <div>
                            <h4 className="text-white font-black text-lg uppercase italic tracking-tight">Masih mengalami kendala setup?</h4>
                            <p className="text-slate-400 text-xs font-medium mt-1">Tim technical support kami siap membantu verifikasi manual akun GCP Anda.</p>
                        </div>
                    </div>
                    <a
                        href="https://t.me/your_support_link"
                        target="_blank"
                        className="bg-white text-slate-950 hover:bg-blue-50 text-white font-black px-10 py-4 rounded-2xl text-[10px] uppercase tracking-[0.2em] transition-all relative z-10 shadow-xl active:scale-95"
                    >
                        Hubungi Support (Telegram)
                    </a>
                </div>
            </section>

            {/* Footer Info */}
            <div className="text-center">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.3em]">Mabar Studio UGC Production v1.2 • © 2025 RootIndo</p>
            </div>
        </div>
    );
};

export default UsageGuide;
