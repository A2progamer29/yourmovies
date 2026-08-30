import React, { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { loadAdsConfig, frequencyAllows, markShown, fetchVast, fireTrackers } from "@/lib/ads";

const FREQ_KEY = "ym_preroll_last";

export default function PreRollAd({ onDone, enforce = false, required = true }) {
    const onDoneRef = useRef(onDone);
    const finishedRef = useRef(false);
    const videoRef = useRef(null);
    const [vast, setVast] = useState(null);
    const [campaign, setCampaign] = useState(null);
    const [left, setLeft] = useState(0);
    const [skipAfter, setSkipAfter] = useState(5);

    useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

    const finish = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onDoneRef.current?.();
    };

    // Sélection de la source : VAST (régie) puis campagne maison, sinon on passe.
    useEffect(() => {
        let active = true;
        (async () => {
            if (!required) { finish(); return; }
            const cfg = await loadAdsConfig();
            if (!active) return;
            const pre = cfg?.preroll || {};
            if (!cfg?.enabled || !pre.enabled) { finish(); return; }
            if (!enforce && !frequencyAllows(FREQ_KEY, pre.frequency_minutes)) { finish(); return; }

            setSkipAfter(Number(pre.skip_after) || 5);

            if (pre.vast_tag_url) {
                const parsed = await fetchVast(pre.vast_tag_url);
                if (!active) return;
                if (parsed) {
                    markShown(FREQ_KEY);
                    fireTrackers(parsed.impressions);
                    setVast(parsed);
                    setLeft(Number(pre.duration) || 15);
                    return;
                }
            }

            const house = (cfg.campaigns || []).filter((c) => c.url);
            if (!house.length) { finish(); return; }
            let index = 0;
            try {
                const previous = Number(sessionStorage.getItem("ym_last_ad") || -1);
                index = (previous + 1) % house.length;
                sessionStorage.setItem("ym_last_ad", String(index));
            } catch { }
            const chosen = house[index];
            markShown(FREQ_KEY);
            setCampaign(chosen);
            setSkipAfter(Number(chosen.skipAfter) || 5);
            setLeft(Number(chosen.duration) || 10);
        })();
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Décompte commun aux deux modes.
    useEffect(() => {
        if (!vast && !campaign) return undefined;
        const timer = window.setInterval(() => {
            setLeft((current) => {
                if (current <= 1) {
                    window.clearInterval(timer);
                    finish();
                    return 0;
                }
                return current - 1;
            });
        }, 1000);
        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vast, campaign]);

    if (!vast && !campaign) return null;

    const total = vast ? Math.max(1, left) : campaign.duration;
    const elapsed = Math.max(0, (vast ? (videoRef.current?.duration || total) : total) - left);
    const canSkip = elapsed >= skipAfter;

    const SkipButton = () => canSkip ? (
        <button
            type="button"
            onClick={finish}
            data-testid="preroll-skip"
            className="absolute bottom-4 right-4 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/15"
        >
            Passer la publicité ›
        </button>
    ) : null;

    if (vast) {
        return (
            <div className="absolute inset-0 overflow-hidden bg-black text-white">
                <video
                    ref={videoRef}
                    src={vast.mediaUrl}
                    autoPlay
                    playsInline
                    controls={false}
                    data-testid="preroll-vast"
                    className="h-full w-full object-contain"
                    onEnded={finish}
                    onError={finish}
                    onClick={() => vast.clickThrough && window.open(vast.clickThrough, "_blank", "noopener,noreferrer")}
                />
                <div className="pointer-events-none absolute left-3 top-3 rounded border border-white/15 bg-black/65 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
                    Publicité
                </div>
                <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/65 px-2 py-1 text-xs text-white/80 backdrop-blur">
                    {left}s
                </div>
                <SkipButton />
            </div>
        );
    }

    return (
        <div className="absolute inset-0 overflow-hidden bg-[#050505] text-white">
            {campaign.imageUrl && (
                <img
                    src={campaign.imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/30" />

            <div className="absolute left-3 top-3 rounded border border-white/15 bg-black/65 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
                Publicité · {campaign.advertiser}
            </div>
            <div className="absolute right-3 top-3 rounded bg-black/65 px-2 py-1 text-xs text-white/80 backdrop-blur">
                {left}s
            </div>

            <div className="relative flex h-full max-w-2xl flex-col justify-center px-7 sm:px-12">
                <h2 className="font-display text-3xl text-white sm:text-5xl">{campaign.title}</h2>
                {campaign.description && (
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-300 sm:text-base">
                        {campaign.description}
                    </p>
                )}
                <a
                    href={campaign.url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-[#E8D2A6] px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#D4BB8B]"
                    aria-label={`${campaign.cta} — ouvre le site de ${campaign.advertiser} dans un nouvel onglet`}
                >
                    {campaign.cta} <ExternalLink size={15} />
                </a>
            </div>

            <SkipButton />

            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                <div
                    className="h-full bg-[#E8D2A6] transition-all duration-1000 ease-linear"
                    style={{ width: `${(elapsed / campaign.duration) * 100}%` }}
                />
            </div>
        </div>
    );
}
