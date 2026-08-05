import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";

const AD_SECONDS = 8;
const SKIP_AFTER = 5;

// Pré-roll publicitaire TEMPORAIRE (en attendant Google Ad Manager / VAST).
export default function PreRollAd({ onDone }) {
    const navigate = useNavigate();
    const [left, setLeft] = useState(AD_SECONDS);

    useEffect(() => {
        const t = setInterval(() => {
            setLeft((l) => {
                if (l <= 1) { clearInterval(t); onDone?.(); return 0; }
                return l - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [onDone]);

    const elapsed = AD_SECONDS - left;
    const canSkip = elapsed >= SKIP_AFTER;

    return (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center text-center px-6">
            <div className="absolute top-3 left-3 text-[10px] uppercase tracking-widest bg-white/10 text-white px-2 py-1 rounded">Publicité</div>
            <div className="text-neutral-500 text-sm mb-2">Votre vidéo démarre dans</div>
            <div className="font-display text-6xl text-[#E8D2A6] mb-6" data-testid="preroll-countdown">{left}</div>
            <button onClick={() => navigate("/pricing")} className="flex items-center gap-2 text-sm text-neutral-300 hover:text-[#E8D2A6]">
                <Crown size={14} /> Passez Premium pour zapper les pubs
            </button>
            {canSkip && (
                <button onClick={() => onDone?.()} data-testid="preroll-skip" className="absolute bottom-4 right-4 text-sm bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full">
                    Passer la pub ›
                </button>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                <div className="h-full bg-[#E8D2A6] transition-all duration-1000 ease-linear" style={{ width: `${(elapsed / AD_SECONDS) * 100}%` }} />
            </div>
        </div>
    );
}
