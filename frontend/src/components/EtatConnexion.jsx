import React, { useCallback, useEffect, useRef, useState } from "react";
import { WifiOff, Gauge, RefreshCw } from "lucide-react";
import { surAttenteReseau } from "@/lib/api";

// Une requête encore en attente au-delà de ce délai signe une liaison poussive.
const SEUIL_LENTEUR_MS = 6000;
// Le bandeau ne disparaît qu'après un moment sans attente : sinon il clignoterait
// au rythme des requêtes sur une connexion justement irrégulière.
const REPOS_AVANT_RETRAIT_MS = 4000;

/** État de la connexion : page dédiée hors ligne, bandeau discret si ça rame.
 *
 *  La perte de réseau se lit par les événements du navigateur, plus fiables et
 *  immédiats qu'une requête témoin. La lenteur, elle, se mesure sur les appels
 *  réels du site : l'indication annoncée par le navigateur est absente sur
 *  plusieurs d'entre eux et ne dit rien du serveur. */
export default function EtatConnexion() {
    const [horsLigne, setHorsLigne] = useState(() => {
        try { return navigator.onLine === false; } catch { return false; }
    });
    const [lent, setLent] = useState(false);
    const masque = useRef(false);

    useEffect(() => {
        const perdue = () => setHorsLigne(true);
        const revenue = () => { setHorsLigne(false); setLent(false); };
        window.addEventListener("offline", perdue);
        window.addEventListener("online", revenue);
        return () => {
            window.removeEventListener("offline", perdue);
            window.removeEventListener("online", revenue);
        };
    }, []);

    useEffect(() => {
        let minuteur = null;
        const desabonner = surAttenteReseau((debut) => {
            window.clearTimeout(minuteur);
            if (debut === null) {
                minuteur = window.setTimeout(() => setLent(false), REPOS_AVANT_RETRAIT_MS);
                return;
            }
            const restant = Math.max(0, SEUIL_LENTEUR_MS - (Date.now() - debut));
            minuteur = window.setTimeout(() => {
                if (!masque.current) setLent(true);
            }, restant);
        });
        return () => { window.clearTimeout(minuteur); desabonner(); };
    }, []);

    const reessayer = useCallback(() => window.location.reload(), []);

    if (horsLigne) {
        return (
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center bg-[#050505] px-6"
                data-testid="hors-ligne"
            >
                <div className="max-w-md text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#262626] bg-[#0a0a0a]">
                        <WifiOff size={26} className="text-[#E8D2A6]" />
                    </div>
                    <h1 className="mt-6 font-display text-3xl tracking-tight text-white">
                        Pas de connexion
                    </h1>
                    <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                        Ton appareil n&apos;est plus relié à Internet. YourMovie&apos;s reviendra tout
                        seul dès que la connexion sera rétablie — rien n&apos;est perdu.
                    </p>
                    <button
                        type="button"
                        onClick={reessayer}
                        data-testid="hors-ligne-reessayer"
                        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E8D2A6] px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#D4BB8B]"
                    >
                        <RefreshCw size={14} /> Réessayer
                    </button>
                </div>
            </div>
        );
    }

    if (!lent) return null;

    return (
        <div
            className="fixed inset-x-3 bottom-3 z-[150] flex items-start gap-3 rounded-xl border border-[#E8D2A6]/30 bg-[#0c0c0c]/95 p-3.5 shadow-2xl backdrop-blur sm:left-auto sm:right-4 sm:max-w-sm"
            data-testid="connexion-lente"
        >
            <Gauge size={16} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
            <div className="min-w-0 flex-1 text-xs leading-relaxed text-neutral-300">
                <span className="text-white">Connexion lente.</span> Les pages et la lecture peuvent
                mettre du temps à arriver. Si tu es en Wi-Fi, te rapprocher de la box aide souvent.
            </div>
            <button
                type="button"
                onClick={() => { masque.current = true; setLent(false); }}
                aria-label="Masquer"
                className="shrink-0 text-neutral-600 transition-colors hover:text-white"
            >
                ×
            </button>
        </div>
    );
}
