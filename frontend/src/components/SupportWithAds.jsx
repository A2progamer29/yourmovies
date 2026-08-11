import React, { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Coins, Loader2, Check, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { loadAdsConfig, injectScript } from "@/lib/ads";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

export default function SupportWithAds() {
    const { refresh } = useAuth();
    const [status, setStatus] = useState(null);
    const [ads, setAds] = useState(null);
    const [countdown, setCountdown] = useState(0);
    const [cooldown, setCooldown] = useState(0);
    const [claimable, setClaimable] = useState(false);
    const [busy, setBusy] = useState(false);
    const timerRef = useRef(null);
    const cooldownRef = useRef(null);

    const formatDelay = (total) => {
        const m = Math.floor(total / 60);
        const s = total % 60;
        return m > 0 ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
    };

    const load = useCallback(async () => {
        try {
            // On n'attend que le statut pour afficher le cadre : la config pub
            // (liens) n'est nécessaire qu'au moment du clic.
            const s = await api.get("/rewards/support/status", { silent: true });
            setStatus(s.data);
            loadAdsConfig().then(setAds).catch(() => { });
        } catch { setStatus(null); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
    }, []);

    // Aligne le compte à rebours local sur la valeur renvoyée par le serveur.
    useEffect(() => {
        setCooldown(Number(status?.cooldown_seconds) || 0);
    }, [status?.cooldown_seconds]);

    // Décompte à la seconde, puis resynchronisation quand le délai est écoulé.
    useEffect(() => {
        if (cooldown <= 0) return undefined;
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown((c) => {
                if (c <= 1) {
                    clearInterval(cooldownRef.current);
                    load();
                    return 0;
                }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(cooldownRef.current);
    }, [cooldown > 0, load]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!status?.available) return null;

    const directLink = ads?.gate?.direct_link || "";
    const popScript = ads?.popunder?.script_url || "";
    const blocked = status.remaining_today <= 0 || cooldown > 0;

    const watch = () => {
        if (directLink) window.open(directLink, "_blank", "noopener,noreferrer");
        else if (popScript) injectScript(popScript);
        setClaimable(false);
        setCountdown(status.watch_seconds);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setCountdown((c) => {
                if (c <= 1) {
                    clearInterval(timerRef.current);
                    setClaimable(true);
                    return 0;
                }
                return c - 1;
            });
        }, 1000);
    };

    const claim = async () => {
        setBusy(true);
        try {
            const r = await api.post("/rewards/support");
            toast.success(`+${r.data.awarded} Freemium — merci pour ton soutien 💛`);
            setClaimable(false);
            // On ne conserve que l'état (quota, délai) : la config du gain vient du statut.
            setStatus((s) => ({
                ...s,
                used_today: r.data.used_today,
                remaining_today: r.data.remaining_today,
                cooldown_seconds: r.data.cooldown_seconds,
            }));
            refresh?.();
        } catch (e) { showError(toast, e, "Récompense impossible"); }
        finally { setBusy(false); }
    };

    return (
        <div className="p-8 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
            <div className="flex items-center gap-2 mb-1">
                <Heart size={18} className="text-[#E8D2A6]" fill="currentColor" />
                <h3 className="font-display text-xl text-white">Soutenir gratuitement</h3>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed">
                Regarde une publicité et finance l&apos;hébergement, sans dépenser un centime.
                Cumule tes Freemium pour t&apos;offrir du Premium — et naviguer ensuite sans aucune publicité.
            </p>

            <div className="mt-3 text-sm text-neutral-400 tabular-nums">
                {status.used_today ?? 0} / {status.daily_max} aujourd&apos;hui
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                {!claimable ? (
                    <Button
                        onClick={watch}
                        disabled={blocked || countdown > 0}
                        data-testid="support-watch-btn"
                        className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold disabled:opacity-50"
                    >
                        {countdown > 0
                            ? <><Loader2 size={15} className="mr-2 animate-spin" /> Encore {countdown}s…</>
                            : cooldown > 0
                                ? <>Disponible dans {formatDelay(cooldown)}</>
                                : <><Coins size={15} className="mr-2" /> Regarder une pub</>}
                    </Button>
                ) : (
                    <Button
                        onClick={claim}
                        disabled={busy}
                        data-testid="support-claim-btn"
                        className="bg-emerald-500 text-black hover:bg-emerald-400 rounded-full h-11 px-6 font-semibold"
                    >
                        <Check size={15} className="mr-2" /> Récupérer +{status.coins} Freemium
                    </Button>
                )}

                <Link to="/pricing" className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-[#E8D2A6] transition-colors">
                    <Crown size={14} /> ou passer Premium
                </Link>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
                {status.remaining_today > 0
                    ? <>Encore <span className="text-neutral-300">{status.remaining_today}</span> publicité{status.remaining_today > 1 ? "s" : ""} possible{status.remaining_today > 1 ? "s" : ""} aujourd&apos;hui.</>
                    : "Quota du jour atteint — reviens demain."}
                {cooldown > 0
                    ? <> Prochaine dans <span className="text-[#E8D2A6] tabular-nums">{formatDelay(cooldown)}</span>.</>
                    : status.remaining_today > 0 && <span className="text-emerald-400"> Disponible maintenant.</span>}
            </div>
        </div>
    );
}
