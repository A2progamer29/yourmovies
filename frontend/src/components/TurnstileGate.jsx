import React, { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ecrirePass, lirePass } from "@/lib/playbackPass";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let chargement;

function chargerScript() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (chargement) return chargement;
    chargement = new Promise((resolve, reject) => {
        const balise = document.createElement("script");
        balise.src = SCRIPT;
        balise.async = true;
        balise.defer = true;
        balise.addEventListener("load", () => resolve(window.turnstile), { once: true });
        balise.addEventListener("error", reject, { once: true });
        document.head.appendChild(balise);
    });
    return chargement;
}

export default function TurnstileGate({ onVerified }) {
    const conteneur = useRef(null);
    const widget = useRef(null);
    const [etat, setEtat] = useState("chargement");
    const [erreur, setErreur] = useState("");

    const valider = useCallback(async (token) => {
        setEtat("envoi");
        try {
            const r = await api.post("/playback/verify", { token }, { silent: true });
            ecrirePass(r.data?.pass);
            onVerified();
        } catch (e) {
            setErreur(e?.response?.data?.detail || "La vérification n'a pas abouti.");
            setEtat("erreur");
        }
    }, [onVerified]);

    useEffect(() => {
        let annule = false;
        (async () => {
            // Un laissez-passer encore valide evite de refaire la verification
            // a chaque episode.
            if (lirePass()) { onVerified(); return; }

            let config;
            try {
                const r = await api.get("/playback/verification", { silent: true });
                config = r.data;
            } catch {
                // Vérification injoignable : on ne bloque pas la lecture.
                onVerified();
                return;
            }
            if (annule) return;
            if (!config?.required || !config?.site_key) { onVerified(); return; }

            try {
                const turnstile = await chargerScript();
                if (annule || !conteneur.current) return;
                setEtat("pret");
                widget.current = turnstile.render(conteneur.current, {
                    sitekey: config.site_key,
                    theme: "dark",
                    callback: valider,
                    "error-callback": () => {
                        setErreur("La vérification a échoué.");
                        setEtat("erreur");
                    },
                    "expired-callback": () => setEtat("pret"),
                });
            } catch {
                // Script bloqué par une extension : on laisse passer plutôt que
                // d'enfermer quelqu'un de légitime devant un écran vide.
                onVerified();
            }
        })();
        return () => { annule = true; };
    }, [onVerified, valider]);

    const reessayer = () => {
        setErreur("");
        setEtat("pret");
        try { window.turnstile?.reset(widget.current); } catch { }
    };

    return (
        <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#050505] px-6 text-center"
            data-testid="turnstile-gate"
        >
            <ShieldCheck size={26} className="text-[#E8D2A6]" />
            <div>
                <div className="font-display text-xl text-white sm:text-2xl">Vérification rapide</div>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-neutral-400">
                    Une seconde pour confirmer que tu n&apos;es pas un robot. C&apos;est ce qui garde la
                    bande passante pour les vraies personnes — et les lecteurs allumés.
                </p>
            </div>

            <div ref={conteneur} className="min-h-[65px]" />

            {etat === "chargement" && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <Loader2 size={13} className="animate-spin" /> Préparation…
                </div>
            )}
            {etat === "envoi" && (
                <div className="flex items-center gap-2 text-xs text-[#E8D2A6]">
                    <Loader2 size={13} className="animate-spin" /> Vérification…
                </div>
            )}
            {etat === "erreur" && (
                <div className="flex flex-col items-center gap-2.5">
                    <p className="text-xs text-red-400">{erreur}</p>
                    <Button
                        onClick={reessayer}
                        data-testid="turnstile-retry"
                        className="h-9 rounded-full bg-[#E8D2A6] px-4 text-xs font-semibold text-black hover:bg-[#D4BB8B]"
                    >
                        <RotateCcw size={13} className="mr-1.5" /> Réessayer
                    </Button>
                </div>
            )}

            <p className="text-[11px] text-neutral-600">Une seule fois par session.</p>
        </div>
    );
}
