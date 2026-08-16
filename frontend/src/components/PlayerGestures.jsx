import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

const SAUT = 10;
const DELAI_DOUBLE_TAP = 300;

/** Commandes de navigation posées par-dessus le lecteur : flèches du clavier,
 *  double appui à gauche ou à droite sur mobile. La barre de contrôle du lecteur
 *  reste libre, sinon on perdrait le plein écran et le réglage de qualité. */
export default function PlayerGestures({ playerRef, disabled }) {
    const [signal, setSignal] = useState(null);
    const dernierTap = useRef({ moment: 0, cote: null });
    const minuterie = useRef(null);

    const montrer = useCallback((type) => {
        setSignal({ type, id: Date.now() });
        if (minuterie.current) window.clearTimeout(minuterie.current);
        minuterie.current = window.setTimeout(() => setSignal(null), 600);
    }, []);

    const deplacer = useCallback((sens) => {
        const p = playerRef?.current;
        if (!p) return;
        try {
            p.getCurrentTime((position) => {
                const cible = Math.max(0, (Number(position) || 0) + sens * SAUT);
                try { p.setCurrentTime(cible); } catch { }
            });
        } catch { }
        montrer(sens > 0 ? "avance" : "recule");
    }, [playerRef, montrer]);

    useEffect(() => {
        if (disabled) return undefined;
        const auClavier = (evenement) => {
            const cible = evenement.target;
            const saisie = cible?.tagName === "INPUT" || cible?.tagName === "TEXTAREA" || cible?.isContentEditable;
            if (saisie || evenement.metaKey || evenement.ctrlKey || evenement.altKey) return;
            if (evenement.key === "ArrowRight") { evenement.preventDefault(); deplacer(1); }
            else if (evenement.key === "ArrowLeft") { evenement.preventDefault(); deplacer(-1); }
        };
        window.addEventListener("keydown", auClavier);
        return () => window.removeEventListener("keydown", auClavier);
    }, [disabled, deplacer]);

    useEffect(() => () => { if (minuterie.current) window.clearTimeout(minuterie.current); }, []);

    if (disabled) return null;

    // Seul le double appui agit : un appui simple ne fait rien, la lecture se
    // met en pause avec le bouton du lecteur.
    const auTap = (cote) => {
        const maintenant = Date.now();
        const precedent = dernierTap.current;
        if (precedent.cote === cote && maintenant - precedent.moment < DELAI_DOUBLE_TAP) {
            dernierTap.current = { moment: 0, cote: null };
            deplacer(cote === "droite" ? 1 : -1);
            return;
        }
        dernierTap.current = { moment: maintenant, cote };
    };

    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[52px] z-20" data-testid="player-gestures">
            <div className="flex h-full">
                <button
                    type="button"
                    aria-label="Reculer de 10 secondes"
                    onClick={() => auTap("gauche")}
                    className="pointer-events-auto h-full flex-1 cursor-default focus:outline-none"
                />
                <button
                    type="button"
                    aria-label="Avancer de 10 secondes"
                    onClick={() => auTap("droite")}
                    className="pointer-events-auto h-full flex-1 cursor-default focus:outline-none"
                />
            </div>

            {signal && (
                <div
                    key={signal.id}
                    className={`ym-seek-flash pointer-events-none absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 ${signal.type === "avance" ? "right-[12%]" : "left-[12%]"}`}
                >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                        {signal.type === "avance"
                            ? <ChevronsRight size={28} className="text-white" />
                            : <ChevronsLeft size={28} className="text-white" />}
                    </div>
                    <span className="text-xs font-semibold text-white drop-shadow">{SAUT} s</span>
                </div>
            )}
        </div>
    );
}
