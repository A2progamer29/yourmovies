import { api } from "@/lib/api";
import React, { useEffect, useRef, useState } from "react";
import PlayerLoading from "@/components/PlayerLoading";
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
export default function AdGate({ onUnlock, access }) {
    const [cfg, setCfg] = useState(null);
    const [step, setStep] = useState(0);
    const [wait, setWait] = useState(0);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const [until, setUntil] = useState(0);
    const callback = useRef(onUnlock);
    const unlocked = useRef(false);
    const adOpened = useRef(false);
    useEffect(() => { callback.current = onUnlock; }, [onUnlock]);

    useEffect(() => {
        let active = true;
        setError("");
        setReady(false);
        (async () => {
            if (access && !access.gate_steps) { callback.current(); return; }
            try {
            const config = await loadAdsConfig({ force: Boolean(access) || attempt > 0, strict: Boolean(access) });
            if (!active) return;
            const gate = config?.gate || {};
            const popScript = config?.popunder?.script_url || "";
            const directLink = gate.direct_link || "";
            if (!access && (!config?.enabled || !gate.enabled || (!popScript && !directLink))) { callback.current(); return; }
            if (!access && !frequencyAllows(FREQ_KEY, gate.frequency_minutes)) { callback.current(); return; }
            if (!popScript && !directLink) throw new Error("Publicité non configurée. Contactez le support.");
            setCfg({ ...gate, ...(access ? { steps: access.gate_steps, seconds: access.gate_seconds } : {}), popScript, directLink });
            setReady(true);
            } catch (error) {
                if (active) setError(error?.message || "Publicités indisponibles. Réessayez.");
            }
        })();
        return () => { active = false; };
    }, [access, attempt]);

    useEffect(() => {
        const update = () => setWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
        update();
        if (until <= Date.now()) return undefined;
        const timer = window.setInterval(update, 250);
        return () => window.clearInterval(timer);
    }, [until]);

    useEffect(() => {
        if (!cfg || step < (cfg.steps || 1) || wait > 0 || busy || unlocked.current) return;
        unlocked.current = true;
        markShown(FREQ_KEY);
        setOpen(false);
        callback.current();
    }, [cfg, step, wait, busy]);

    if (!ready || !cfg) return error ? <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-neutral-300"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="rounded-full bg-[#E8D2A6] px-5 py-2 text-black">Réessayer</button></div> : <PlayerLoading label="Préparation des publicités…" />;

    const total = cfg.steps || 1;
    const remaining = Math.max(0, total - step);

    const advance = async () => {
        if (wait > 0 || busy || step >= total) return;
        setBusy(true);
        setError("");
        // Ouverture pendant le clic : seule façon fiable d'échapper au bloqueur
        // de fenêtres. Le Direct Link mène à une vraie page publicitaire.
        if (!adOpened.current && cfg.directLink) {
            window.open(cfg.directLink, "_blank", "noopener,noreferrer");
            adOpened.current = true;
        } else if (!adOpened.current && cfg.popScript) {
            injectScript(cfg.popScript);
            adOpened.current = true;
        }
        if (access) {
            try {
                await api.post("/playback/access/step", {}, { headers: { "X-Playback-Grant": access.grant }, silent: true });
            } catch (e) {
                const seconds = Number(e?.response?.headers?.["retry-after"]);
                if (seconds > 0) { setWait(seconds); setUntil(Date.now() + seconds * 1000); }
                setError(e?.response?.data?.detail || "Étape non validée. Réessayez.");
                setBusy(false);
                return;
            }
        }
        setBusy(false);
        adOpened.current = false;
        const next = step + 1;
        setStep(next);
        setWait(cfg.seconds || 0);
        setUntil(Date.now() + (cfg.seconds || 0) * 1000);
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

                    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                    <button
                        type="button"
                        onClick={advance}
                        disabled={wait > 0 || busy || step >= total}
                        data-testid="gate-continue-btn"
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#E8D2A6] px-6 font-semibold text-black transition-colors hover:bg-[#D4BB8B] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {wait > 0
                            ? <><Loader2 size={16} className="animate-spin" /> Patiente {wait}s…</>
                            : busy ? <><Loader2 size={16} className="animate-spin" /> Validation…</>
                            : <>Ouvrir la publicité {Math.min(step + 1, total)}/{total}</>}
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
