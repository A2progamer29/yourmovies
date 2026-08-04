import React, { useEffect, useState } from "react";

// Écran de préchargement bloquant : logo animé + barre de progression + pourcentage.
export default function Splash() {
    const [progress, setProgress] = useState(0);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let p = 0;
        const tick = setInterval(() => {
            p += Math.random() * 11 + 5;
            if (p >= 100) {
                p = 100;
                clearInterval(tick);
                setTimeout(() => setHidden(true), 450);
            }
            setProgress(Math.min(100, Math.round(p)));
        }, 130);
        return () => clearInterval(tick);
    }, []);

    if (hidden) return null;

    return (
        <div
            className={`fixed inset-0 z-[200] bg-[#050505] flex flex-col items-center justify-center transition-opacity duration-500 ${progress >= 100 ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
            <div className="relative w-24 h-24 mb-7">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#E8D2A6] border-r-[#E8D2A6]/30 animate-spin" />
                <img src="/logo.png" alt="" className="absolute inset-[8px] rounded-full object-cover" />
            </div>
            <div className="font-display text-2xl text-white tracking-tight">
                YourMovie<span className="text-[#E8D2A6]">&apos;s</span>
            </div>
            <div className="w-56 h-1.5 rounded-full bg-white/10 overflow-hidden mt-6">
                <div className="h-full bg-[#E8D2A6] transition-all duration-150" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-[#E8D2A6] mt-2">{progress}%</div>
        </div>
    );
}
