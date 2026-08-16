import React, { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";

const DELAI = 10;
const RAYON = 15;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

export default function SuiteAutomatique({ suite, onLancer, onAnnuler }) {
    const [restant, setRestant] = useState(DELAI);
    const lancer = useRef(onLancer);

    useEffect(() => { lancer.current = onLancer; });
    useEffect(() => { setRestant(DELAI); }, [suite.cle]);

    useEffect(() => {
        if (restant <= 0) {
            lancer.current();
            return undefined;
        }
        const minuteur = window.setTimeout(() => setRestant((valeur) => valeur - 1), 1000);
        return () => window.clearTimeout(minuteur);
    }, [restant]);

    return (
        <div
            className="absolute bottom-16 right-4 z-40 w-[300px] max-w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-[#343434] bg-black/90 shadow-2xl backdrop-blur"
            data-testid="suite-automatique"
        >
            <div className="flex items-start gap-3 p-3">
                {suite.poster
                    ? <img src={suite.poster} alt="" className="h-[72px] w-12 shrink-0 rounded object-cover" />
                    : <div className="h-[72px] w-12 shrink-0 rounded bg-[#161616]" />}

                <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-widest text-[#E8D2A6]">
                        {suite.genre === "episode" ? "Épisode suivant" : "Suite de la saga"}
                    </div>
                    <div className="mt-1 truncate text-sm text-white">{suite.titre}</div>
                    {suite.detail && (
                        <div className="mt-0.5 truncate text-xs text-neutral-500">{suite.detail}</div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onAnnuler}
                    aria-label="Annuler la lecture automatique"
                    className="shrink-0 rounded p-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <X size={15} />
                </button>
            </div>

            <div className="flex items-center gap-3 border-t border-[#1f1f1f] px-3 py-2.5">
                <div className="relative h-9 w-9 shrink-0">
                    <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden="true">
                        <circle cx="18" cy="18" r={RAYON} fill="none" stroke="#262626" strokeWidth="2.5" />
                        <circle
                            cx="18"
                            cy="18"
                            r={RAYON}
                            fill="none"
                            stroke="#E8D2A6"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeDasharray={CIRCONFERENCE}
                            strokeDashoffset={CIRCONFERENCE * (1 - restant / DELAI)}
                            style={{ transition: "stroke-dashoffset 1s linear" }}
                        />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] tabular-nums text-white">
                        {restant}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={onLancer}
                    data-testid="suite-lancer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#E8D2A6] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#D4BB8B]"
                >
                    <Play size={14} fill="currentColor" /> Lire maintenant
                </button>
            </div>
        </div>
    );
}
