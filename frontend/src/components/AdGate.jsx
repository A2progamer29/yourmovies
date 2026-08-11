import React, { useEffect, useState } from "react";
import { PlayCircle, Loader2, ShieldCheck, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { loadAdsConfig, frequencyAllows, markShown, injectScript } from "@/lib/ads";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const FREQ_KEY = "ym_gate_last";

/**
 * Porte avant lecture. Affichée en fenêtre modale (et non dans le lecteur) :
 * sur mobile, le cadre du lecteur est trop bas pour rester lisible.
 * Aucune vérification de ce qui se passe dans l'onglet publicitaire n'est
 * possible (isolation navigateur) : on compte les étapes validées.
 */
export default function AdGate({ onUnlock }) {
    const [cfg, setCfg] = useState(null);
    const [step, setStep] = useState(0);
    const [wait, setWait] = useState(0);
    const [ready, setReady] = useState(false);
    const [open, setOpen] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            const config = await loadAdsConfig();
            if (!active) return;
            const gate = config?.gate || {};
            const popScript = config?.popunder?.script_url || "";
            const directLink = gate.direct_link || "";
            if (!config?.enabled || !gate.enabled || (!popScript && !directLink)) { onUnlock(); return; }
            if (!frequencyAllows(FREQ_KEY, gate.frequency_minutes)) { onUnlock(); return; }
            setCfg({ ...gate, popScript, directLink });
            setReady(true);
        })();
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (wait <= 0) return undefined;
        const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [wait]);

    if (!ready || !cfg) return null;

    const total = cfg.steps || 1;
    const remaining = Math.max(0, total - step);

    const advance = () => {
        if (wait > 0) return;
        // Ouverture pendant le clic : seule façon fiable d'échapper au bloqueur
        // de fenêtres. Le Direct Link mène à une vraie page publicitaire.
        if (cfg.directLink) {
            window.open(cfg.directLink, "_blank", "noopener,noreferrer");
        } else if (cfg.popScript) {
            injectScript(cfg.popScript);
        }
        const next = step + 1;
        if (next >= total) {
            markShown(FREQ_KEY);
            setOpen(false);
            onUnlock();
            return;
        }
        setStep(next);
        setWait(cfg.seconds || 0);
    };

    return (
        <>
            {/* Le lecteur reste bloqué tant que les étapes ne sont pas validées. */}
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#050505] px-6 text-center">
                <Lock size={22} className="text-[#E8D2A6]" />
                <p className="text-sm text-neutral-400">Lecture bloquée</p>
                {!open && (
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        data-testid="gate-reopen"
                        className="mt-1 inline-flex h-11 items-center rounded-full bg-[#E8D2A6] px-6 text-sm font-semibold text-black transition-colors hover:bg-[#D4BB8B]"
                    >
                        Débloquer la lecture
                    </button>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl flex items-center gap-2.5">
                            <PlayCircle size={22} className="text-[#E8D2A6]" /> Lancer la lecture
                        </DialogTitle>
                        <DialogDescription className="sr-only">Regardez la publicité proposée pour débloquer la lecture.</DialogDescription>
                    </DialogHeader>

                    <p className="text-sm leading-relaxed text-neutral-400 -mt-1">
                        La publicité finance l&apos;hébergement et garde le catalogue gratuit.
                        {total > 1 ? ` Encore ${remaining} étape${remaining > 1 ? "s" : ""}.` : ""}
                    </p>

                    {total > 1 && (
                        <div className="flex items-center gap-2">
                            {Array.from({ length: total }).map((_, i) => (
                                <span
                                    key={i}
                                    className={`h-1.5 flex-1 rounded-full transition-all ${i < step ? "bg-[#E8D2A6]" : "bg-white/15"}`}
                                />
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={advance}
                        disabled={wait > 0}
                        data-testid="gate-continue-btn"
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#E8D2A6] px-6 font-semibold text-black transition-colors hover:bg-[#D4BB8B] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {wait > 0
                            ? <><Loader2 size={16} className="animate-spin" /> Patiente {wait}s…</>
                            : <>{step === 0 ? "Continuer" : `Continuer (${step + 1}/${total})`}</>}
                    </button>

                    <div className="rounded-xl border border-[#262626] bg-[#111] p-3.5 text-left">
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[#E8D2A6]">
                            <ShieldCheck size={12} /> Ne plus voir de publicité
                        </div>
                        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-neutral-400">
                            <li>
                                <Link to="/settings?tab=subscription" className="text-white underline decoration-[#E8D2A6]/50 underline-offset-2 hover:text-[#E8D2A6]">
                                    Soutenir gratuitement
                                </Link>{" "}
                                — regarde des pubs depuis tes paramètres et gagne des Freemium.
                            </li>
                            <li>
                                <Link to="/pricing" className="text-white underline decoration-[#E8D2A6]/50 underline-offset-2 hover:text-[#E8D2A6]">
                                    S&apos;abonner
                                </Link>{" "}
                                — Premium supprime toute publicité.
                            </li>
                        </ul>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
