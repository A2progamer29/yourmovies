import React, { useEffect, useState } from "react";

// Écran de préchargement : affiché une seule fois par session (si déjà chargé, ne réapparaît pas).
export default function Splash() {
    const [show] = useState(() => {
        try {
            if (sessionStorage.getItem("ym_splash_seen")) return false;
            sessionStorage.setItem("ym_splash_seen", "1");
            return true;
        } catch { return true; }
    });
    const [progress, setProgress] = useState(0);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (!show) return;
        let p = 0;
        const tick = setInterval(() => {
            p += Math.random() * 12 + 6;
            if (p >= 100) {
                p = 100;
                clearInterval(tick);
                setTimeout(() => setHidden(true), 450);
            }
            setProgress(Math.min(100, Math.round(p)));
        }, 120);
        return () => clearInterval(tick);
    }, [show]);

    if (!show || hidden) return null;

    return (
        <div
            className={`fixed inset-0 z-[200] bg-[#050505] flex flex-col items-center justify-center transition-opacity duration-500 ${progress >= 100 ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
            <div className="font-display text-3xl sm:text-4xl text-white tracking-tight mb-8">
                YourMovie<span className="text-[#E8D2A6]">&apos;s</span>
            </div>
            <div className="w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-[#E8D2A6] transition-all duration-150" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-[#E8D2A6] mt-3">{progress}%</div>
        </div>
    );
}
