import React, { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

const DEFAULT_DURATION = 10;
const DEFAULT_SKIP_AFTER = 5;

function validHttpsUrl(value) {
    try {
        const url = new URL(String(value || "").trim());
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function loadCampaigns() {
    const raw = process.env.REACT_APP_AD_CAMPAIGNS;
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.flatMap((campaign, index) => {
            const url = validHttpsUrl(campaign?.url);
            if (!url || campaign?.enabled === false) return [];

            const imageUrl = validHttpsUrl(campaign?.imageUrl);
            const duration = Math.min(60, Math.max(5, Number(campaign?.duration) || DEFAULT_DURATION));
            const skipAfter = Math.min(duration, Math.max(0, Number(campaign?.skipAfter) || DEFAULT_SKIP_AFTER));

            return [{
                id: String(campaign.id || `campaign-${index}`),
                title: String(campaign.title || "Découvrir l’offre"),
                description: String(campaign.description || ""),
                cta: String(campaign.cta || "En savoir plus"),
                advertiser: String(campaign.advertiser || "Partenaire"),
                url,
                imageUrl,
                duration,
                skipAfter,
            }];
        });
    } catch (error) {
        console.error("REACT_APP_AD_CAMPAIGNS doit contenir un tableau JSON valide.", error);
        return [];
    }
}

export default function PreRollAd({ onDone }) {
    const campaigns = useMemo(loadCampaigns, []);
    const onDoneRef = useRef(onDone);
    const finishedRef = useRef(false);
    const campaign = useMemo(() => {
        if (!campaigns.length) return null;
        const previous = Number(sessionStorage.getItem("ym_last_ad") || -1);
        const next = (previous + 1) % campaigns.length;
        sessionStorage.setItem("ym_last_ad", String(next));
        return campaigns[next];
    }, [campaigns]);
    const [left, setLeft] = useState(campaign?.duration || 0);

    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    const finish = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onDoneRef.current?.();
    };

    useEffect(() => {
        if (!campaign) {
            finish();
            return undefined;
        }

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
    }, [campaign]);

    if (!campaign) return null;

    const elapsed = campaign.duration - left;
    const canSkip = elapsed >= campaign.skipAfter;

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

            {canSkip && (
                <button
                    type="button"
                    onClick={finish}
                    data-testid="preroll-skip"
                    className="absolute bottom-4 right-4 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm text-white backdrop-blur transition-colors hover:bg-white/15"
                >
                    Passer la publicité ›
                </button>
            )}

            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                <div
                    className="h-full bg-[#E8D2A6] transition-all duration-1000 ease-linear"
                    style={{ width: `${(elapsed / campaign.duration) * 100}%` }}
                />
            </div>
        </div>
    );
}
