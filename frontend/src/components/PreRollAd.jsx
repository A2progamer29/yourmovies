import PlayerLoading from "@/components/PlayerLoading";
import { videoProtection } from "@/lib/videoProtection";
import { api } from "@/lib/api";
import React, { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { loadAdsConfig, frequencyAllows, markShown, fetchVast, fireTrackers } from "@/lib/ads";

const FREQ_KEY = "ym_preroll_last";

export default function PreRollAd({ onDone, enforce = false, required = true, access = null }) {
    const onDoneRef = useRef(onDone);
    const finishedRef = useRef(false);
    const videoRef = useRef(null);
    const [vast, setVast] = useState(null);
    const [campaign, setCampaign] = useState(null);
    const [left, setLeft] = useState(0);
    const [skipAfter, setSkipAfter] = useState(5);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(15);
    const [error, setError] = useState("");
    const [needsPlay, setNeedsPlay] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const impressionSent = useRef(false);
    const proofPromise = useRef(null);
    const finishingRef = useRef(false);

    useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

    const startServerProof = () => {
        if (!access?.grant || !(Number(access?.preroll_seconds) > 0)) return Promise.resolve(null);
        if (!proofPromise.current) {
            proofPromise.current = api.post("/playback/access/preroll", { action: "start" }, {
                headers: { "X-Playback-Grant": access.grant }, silent: true,
            }).then(({ data }) => data?.challenge || null);
        }
        return proofPromise.current;
    };

    const finish = async () => {
        if (finishedRef.current || finishingRef.current) return;
        finishingRef.current = true;
        try {
            const challenge = await startServerProof();
            if (challenge) {
                try {
                    await api.post("/playback/access/preroll", { action: "complete", challenge }, {
                        headers: { "X-Playback-Grant": access.grant }, silent: true,
                    });
                } catch (error) {
                    const seconds = Number(error?.response?.headers?.["retry-after"]);
                    if (!(seconds > 0 && seconds <= 120)) throw error;
                    await new Promise(resolve => window.setTimeout(resolve, seconds * 1000 + 100));
                    await api.post("/playback/access/preroll", { action: "complete", challenge }, {
                        headers: { "X-Playback-Grant": access.grant }, silent: true,
                    });
                }
            }
            finishedRef.current = true;
            onDoneRef.current?.();
        } catch (error) {
            setError(error?.response?.data?.detail || "La validation de la publicité a échoué. Réessayez.");
        } finally {
            finishingRef.current = false;
        }
    };

    // Sélection de la source : VAST (régie) puis campagne maison, sinon on passe.
    useEffect(() => {
        let active = true;
        setError(""); setVast(null); setCampaign(null); setElapsed(0); setNeedsPlay(false);
        finishedRef.current = false;
        impressionSent.current = false;
        (async () => {
            try {
            if (!required) { finish(); return; }
            const cfg = await loadAdsConfig({ force: enforce || attempt > 0, strict: enforce });
            if (!active) return;
            const pre = cfg?.preroll || {};
            if (!cfg?.enabled || !pre.enabled) {
                if (enforce) throw new Error("Publicité indisponible. Réessayez dans un instant.");
                finish(); return;
            }
            if (!enforce && !frequencyAllows(FREQ_KEY, pre.frequency_minutes)) { finish(); return; }

            setSkipAfter(Math.max(0, Number(pre.skip_after ?? 5)));

            if (pre.vast_tag_url) {
                const parsed = await fetchVast(pre.vast_tag_url);
                if (!active) return;
                if (parsed) {
                    setVast(parsed);
                    setDuration(Number(pre.duration) || 15);
                    setLeft(Number(pre.duration) || 15);
                    return;
                }
            }

            const house = (cfg.campaigns || []).filter((c) => c.url);
            if (!house.length) {
                if (enforce) throw new Error("La régie n'a pas fourni de publicité. Réessayez.");
                finish(); return;
            }
            let index = 0;
            try {
                const previous = Number(sessionStorage.getItem("ym_last_ad") || -1);
                index = (previous + 1) % house.length;
                sessionStorage.setItem("ym_last_ad", String(index));
            } catch { }
            const chosen = house[index];
            markShown(FREQ_KEY);
            setCampaign(chosen);
            setSkipAfter(Math.max(0, Number(chosen.skipAfter ?? 5)));
            setDuration(Number(chosen.duration) || 10);
            setLeft(Number(chosen.duration) || 10);
            } catch (error) {
                if (active) setError(error?.message || "Chargement de la publicité impossible.");
            }
        })();
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enforce, required, attempt]);

    // Une vidéo est comptée à partir de sa progression réelle, jamais d'une
    // horloge démarrée pendant son chargement ou un refus de lecture automatique.
    useEffect(() => {
        if (!campaign) return undefined;
        startServerProof().catch(error => setError(error?.response?.data?.detail || "Validation publicitaire indisponible."));
        const timer = window.setInterval(() => {
            if (document.visibilityState === "hidden") return;
            setElapsed(current => Math.min(duration, current + 1));
            setLeft(current => Math.max(0, current - 1));
        }, 1000);
        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaign, duration]);

    useEffect(() => {
        if (campaign && elapsed >= duration) finish();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [campaign, elapsed, duration]);

    const playAd = () => {
        setNeedsPlay(false);
        videoRef.current?.play()?.catch(() => setNeedsPlay(true));
    };

    if (error) return <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#050505] p-6 text-center text-sm text-neutral-300"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="rounded-full bg-[#E8D2A6] px-5 py-2 text-black">Réessayer la publicité</button></div>;

    if (!vast && !campaign) return <PlayerLoading label="Préparation de la publicité…" />;

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
                <video {...videoProtection}
                    ref={videoRef}
                    src={vast.mediaUrl}
                    autoPlay
                    playsInline
                    controls={false}
                    data-testid="preroll-vast"
                    className="h-full w-full object-contain"
                    onCanPlay={playAd}
                    onPlaying={() => {
                        setNeedsPlay(false);
                        startServerProof().catch(error => setError(error?.response?.data?.detail || "Validation publicitaire indisponible."));
                        if (!impressionSent.current) { impressionSent.current = true; markShown(FREQ_KEY); fireTrackers(vast.impressions); }
                    }}
                    onTimeUpdate={event => {
                        const video = event.currentTarget;
                        setElapsed(video.currentTime);
                        setLeft(Math.ceil(Math.max(0, (Number.isFinite(video.duration) ? video.duration : duration) - video.currentTime)));
                    }}
                    onEnded={finish}
                    onError={() => setError("La publicité vidéo n'a pas pu être chargée. Réessayez.")}
                    onClick={() => vast.clickThrough && window.open(vast.clickThrough, "_blank", "noopener,noreferrer")}
                />
                {needsPlay && <button type="button" onClick={playAd} className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">Lancer la publicité</button>}
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
