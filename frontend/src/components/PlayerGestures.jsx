import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

const SAUT = 10;
const DELAI_DOUBLE_TAP = 300;

/** Commandes de navigation du lecteur.
 *
 *  Le clavier — barre d'espace et flèches — vaut sur tous les appareils. La
 *  surcouche d'appui, elle, n'est posée qu'au doigt : à la souris elle privait le
 *  lecteur des mouvements de pointeur, et ses contrôles ne sortaient plus que
 *  dans la bande du bas laissée libre. */
export default function PlayerGestures({ playerRef, disabled }) {
    const [signal, setSignal] = useState(null);
    const [pret, setPret] = useState(false);
    // La surcouche ne sert qu'au doigt. A la souris, elle privait le lecteur des
    // mouvements de pointeur : ses controles ne sortaient qu'en bas, la seule
    // bande laissee libre. Le clavier, lui, reste actif partout.
    const [tactile] = useState(() => {
        try {
            return window.matchMedia("(hover: none), (pointer: coarse)").matches;
        } catch {
            return false;
        }
    });
    const enLecture = useRef(true);
    const dernierTap = useRef({ moment: 0, cote: null });
    const minuterie = useRef(null);
    const attenteTap = useRef(null);

    // La surcouche masque le lecteur : tant que son interface n'est pas joignable,
    // elle ne doit rien intercepter, sinon les clics se perdent dans le vide.
    useEffect(() => {
        if (disabled) return undefined;
        if (playerRef?.current) { setPret(true); return undefined; }
        if (!tactile) return undefined;
        const sonde = window.setInterval(() => {
            if (playerRef?.current) {
                setPret(true);
                window.clearInterval(sonde);
            }
        }, 400);
        const abandon = window.setTimeout(() => window.clearInterval(sonde), 20000);
        return () => { window.clearInterval(sonde); window.clearTimeout(abandon); };
    }, [playerRef, disabled, tactile]);

    // L'état de lecture se suit par les événements du lecteur : lui demander à
    // chaque appui passerait par un aller-retour trop lent pour la barre d'espace.
    useEffect(() => {
        const p = playerRef?.current;
        if (!pret || !p) return undefined;
        const enMarche = () => { enLecture.current = true; };
        const arrete = () => { enLecture.current = false; };
        try {
            p.on("play", enMarche);
            p.on("pause", arrete);
            p.on("ended", arrete);
            // Si le navigateur a refusé le démarrage automatique, la vidéo est déjà
            // en pause : sans cette lecture initiale, le premier appui la mettrait
            // en pause une seconde fois et paraîtrait sans effet.
            p.getPaused((enPause) => { enLecture.current = !enPause; });
        } catch { }
        return () => {
            try { p.off("play", enMarche); p.off("pause", arrete); p.off("ended", arrete); } catch { }
        };
    }, [playerRef, pret]);

    const montrer = useCallback((type) => {
        setSignal({ type, id: Date.now() });
        if (minuterie.current) window.clearTimeout(minuterie.current);
        minuterie.current = window.setTimeout(() => setSignal(null), 600);
    }, []);

    const basculerLecture = useCallback(() => {
        const p = playerRef?.current;
        if (!p) return;
        try {
            if (enLecture.current) { p.pause(); enLecture.current = false; }
            else { p.play(); enLecture.current = true; }
        } catch { }
    }, [playerRef]);

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
            else if (evenement.key === " " || evenement.code === "Space") {
                // Sans cela la page défilerait à chaque pause.
                evenement.preventDefault();
                basculerLecture();
            }
        };
        window.addEventListener("keydown", auClavier);
        return () => window.removeEventListener("keydown", auClavier);
    }, [disabled, deplacer, basculerLecture]);

    useEffect(() => () => {
        if (minuterie.current) window.clearTimeout(minuterie.current);
        if (attenteTap.current) window.clearTimeout(attenteTap.current);
    }, []);

    if (disabled || !pret || !tactile) return null;

    /** La pause est différée le temps de savoir si un second appui vient : c'est
     *  lui qui commande l'avance rapide. */
    const auTap = (cote) => {
        const maintenant = Date.now();
        const precedent = dernierTap.current;
        if (precedent.cote === cote && maintenant - precedent.moment < DELAI_DOUBLE_TAP) {
            if (attenteTap.current) window.clearTimeout(attenteTap.current);
            dernierTap.current = { moment: 0, cote: null };
            deplacer(cote === "droite" ? 1 : -1);
            return;
        }
        dernierTap.current = { moment: maintenant, cote };
        if (attenteTap.current) window.clearTimeout(attenteTap.current);
        attenteTap.current = window.setTimeout(basculerLecture, DELAI_DOUBLE_TAP);
    };

    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[52px] z-20" data-testid="player-gestures">
            <div className="flex h-full">
                <button
                    type="button"
                    aria-label="Lecture ou pause, double appui pour reculer de 10 secondes"
                    onClick={() => auTap("gauche")}
                    className="pointer-events-auto h-full flex-1 cursor-pointer focus:outline-none"
                />
                <button
                    type="button"
                    aria-label="Lecture ou pause, double appui pour avancer de 10 secondes"
                    onClick={() => auTap("droite")}
                    className="pointer-events-auto h-full flex-1 cursor-pointer focus:outline-none"
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
