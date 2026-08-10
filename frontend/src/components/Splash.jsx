import React, { useEffect, useState } from "react";

const MAX_MS = 320;

// Écran d'accueil très bref : il s'efface dès que l'application est peinte
// (plafonné à 320 ms) au lieu d'attendre une barre de progression factice.
export default function Splash() {
    const [show] = useState(() => {
        try {
            if (sessionStorage.getItem("ym_splash_seen")) return false;
            sessionStorage.setItem("ym_splash_seen", "1");
            return true;
        } catch { return true; }
    });
    const [leaving, setLeaving] = useState(false);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (!show) return undefined;
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            setLeaving(true);
            window.setTimeout(() => setHidden(true), 200);
        };
        // Dès la première image peinte, sinon au plus tard après MAX_MS.
        const raf = requestAnimationFrame(() => requestAnimationFrame(finish));
        const cap = window.setTimeout(finish, MAX_MS);
        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(cap);
        };
    }, [show]);

    if (!show || hidden) return null;

    return (
        <div
            className={`fixed inset-0 z-[200] bg-[#050505] flex items-center justify-center transition-opacity duration-200 ${leaving ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
            <div className="font-display text-3xl sm:text-4xl text-white tracking-tight">
                YourMovie<span className="text-[#E8D2A6]">&apos;s</span>
            </div>
        </div>
    );
}
