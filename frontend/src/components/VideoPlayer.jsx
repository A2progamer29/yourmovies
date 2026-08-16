import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, SkipBack, SkipForward, Zap, X } from "lucide-react";
import { Link } from "react-router-dom";

// Google IMA sample VAST tag (linear ad, production-grade Google IMA infrastructure).
// Change to your real ad server VAST/VMAP URL in production.
const IMA_SDK_URL = "https://imasdk.googleapis.com/js/sdkloader/ima3.js";
const SAMPLE_VAST_TAG =
    "https://pubads.g.doubleclick.net/gampad/ads?" +
    "iu=/21775744923/external/single_ad_samples&sz=640x480&" +
    "cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&" +
    "gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=";

// Tag publicitaire : défini via REACT_APP_AD_TAG_URL (ta régie, ex. Google Ad Manager).
// Sans lui, ce sont les pubs de démonstration de Google (aucun revenu).
const AD_TAG_URL = process.env.REACT_APP_AD_TAG_URL || SAMPLE_VAST_TAG;

const QUALITY_ORDER = ["4k", "1080p", "720p", "480p"];
const VITESSES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function loadIma() {
    return new Promise((resolve, reject) => {
        if (window.google?.ima) return resolve(window.google.ima);
        const s = document.createElement("script");
        s.src = IMA_SDK_URL;
        s.async = true;
        s.onload = () => resolve(window.google?.ima);
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

function fmt(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * qualitySources: array of {quality, url}
 * userMaxQuality: highest tier user is allowed to select (4k | 1080p | 720p | 480p)
 * defaultQuality: initial selection
 * runAds: boolean — if true, run IMA preroll before video
 */
export default function VideoPlayer({
    qualitySources = [],
    poster,
    onProgress,
    startAt = 0,
    userMaxQuality = "720p",
    runAds = true,
    preferredQuality = null,
    videoRefOut = null,
    manifestUrl = null,
    onFluxImpossible = null,
    fiche = null,
}) {
    const wrapRef = useRef(null);
    const videoRef = useRef(null);
    // Expose the internal video element to parents (e.g. Watch Party)
    useEffect(() => {
        if (videoRefOut) videoRefOut.current = videoRef.current;
    });
    const adContainerRef = useRef(null);
    const adsManagerRef = useRef(null);
    const adsLoaderRef = useRef(null);

    const availableQualities = qualitySources
        .filter((s) => QUALITY_ORDER.indexOf(s.quality) >= QUALITY_ORDER.indexOf(userMaxQuality))
        .sort((a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality));
    // Pick preferred quality if user has one and it's in the allowed list
    const preferred = preferredQuality && preferredQuality !== "auto"
        ? availableQualities.find((q) => q.quality === preferredQuality)
        : null;
    const initialSrc = preferred || availableQualities[0] || qualitySources[qualitySources.length - 1];

    const [currentQuality, setCurrentQuality] = useState(initialSrc?.quality || "720p");
    const [src, setSrc] = useState(initialSrc?.url || "");
    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [adsRunning, setAdsRunning] = useState(false);
    const [adInfo, setAdInfo] = useState(null); // {remainingTime, skippable, canSkip, index, total}
    const [adsFinished, setAdsFinished] = useState(!runAds);
    const [adsBlocked, setAdsBlocked] = useState(false);
    const [boost, setBoost] = useState(1);
    const [niveaux, setNiveaux] = useState([]);
    const [niveauChoisi, setNiveauChoisi] = useState(-1);
    const [vitesse, setVitesse] = useState(1);
    const [niveauActif, setNiveauActif] = useState(0);
    const hlsRef = useRef(null);
    const chaineAudio = useRef({ contexte: null, gain: null });
    const hideTimer = useRef(null);
    const demarrageAuto = useRef(false);
    const progressTimer = useRef(null);

    // Flux adaptatif : Safari lit le HLS nativement, les autres passent par
    // hls.js, chargé à la demande pour ne pas alourdir le reste du site.
    useEffect(() => {
        const video = videoRef.current;
        if (!manifestUrl || !video) return undefined;
        let annule = false;
        let instance = null;

        // hls.js d'abord : Chrome annonce « maybe » sur le type HLS sans le lire
        // réellement selon les versions, et lui seul expose les niveaux de qualité.
        // La lecture native ne sert que là où hls.js ne fonctionne pas, iOS surtout.
        (async () => {
            try {
                const { default: Hls } = await import("hls.js");
                if (annule) return;
                if (!Hls.isSupported()) {
                    if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = manifestUrl;
                    return;
                }
                instance = new Hls({ capLevelToPlayerSize: true });
                hlsRef.current = instance;
                instance.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (annule) return;
                    setNiveaux(instance.levels.map((n, index) => ({ index, height: n.height })));
                });
                instance.on(Hls.Events.LEVEL_SWITCHED, (_e, donnees) => {
                    if (!annule) setNiveauActif(instance.levels[donnees.level]?.height || 0);
                });
                // Le CDN peut refuser le flux selon le domaine d'où la page est
                // servie, ce que le serveur ne peut pas deviner. Plutôt qu'un
                // écran noir, on rend la main au lecteur intégré.
                instance.on(Hls.Events.ERROR, (_evenement, donnees) => {
                    if (annule || !donnees?.fatal) return;
                    if (onFluxImpossible) onFluxImpossible();
                });
                instance.loadSource(manifestUrl);
                instance.attachMedia(video);
            } catch {
                // hls.js n'a pas pu être chargé : on tente la lecture native,
                // et à défaut le lecteur intégré reprend la main.
                if (annule) return;
                if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = manifestUrl;
                else if (onFluxImpossible) onFluxImpossible();
            }
        })();

        return () => {
            annule = true;
            if (instance) instance.destroy();
            hlsRef.current = null;
        };
    }, [manifestUrl, onFluxImpossible]);

    // Amplification au-delà de 100 %. Le graphe audio n'est construit qu'au
    // premier usage : tant que personne n'y touche, le son suit son chemin
    // habituel et rien ne peut le couper.
    const appliquerBoost = useCallback(async (valeur) => {
        setBoost(valeur);
        const video = videoRef.current;
        if (!video) return;
        if (valeur <= 1 && !chaineAudio.current.contexte) return;
        try {
            if (!chaineAudio.current.contexte) {
                const Contexte = window.AudioContext || window.webkitAudioContext;
                if (!Contexte) return;
                const contexte = new Contexte();
                // Un élément vidéo n'accepte qu'une seule source Web Audio :
                // elle est donc créée une fois et conservée.
                const source = contexte.createMediaElementSource(video);
                const gain = contexte.createGain();
                source.connect(gain).connect(contexte.destination);
                chaineAudio.current = { contexte, gain };
            }
            if (chaineAudio.current.contexte.state === "suspended") {
                await chaineAudio.current.contexte.resume();
            }
            chaineAudio.current.gain.gain.value = valeur;
        } catch {
            // Navigateur trop restrictif : le volume normal reste opérationnel.
        }
    }, []);

    useEffect(() => () => {
        const { contexte } = chaineAudio.current;
        if (contexte && contexte.state !== "closed") contexte.close().catch(() => { });
    }, []);

    // En automatique, la qualité est bridée à la taille réelle du lecteur : inutile
    // de charger du 1080p dans une fenêtre de 700 px, et la bande passante coûte.
    // Un choix manuel doit passer outre, sinon la sélection reste sans effet.
    const choisirNiveau = (index) => {
        setNiveauChoisi(index);
        const hls = hlsRef.current;
        if (hls) {
            hls.capLevelToPlayerSize = index === -1;
            hls.autoLevelCapping = -1;
            hls.currentLevel = index;
        }
        setShowSettings(false);
    };

    const changerVitesse = (valeur) => {
        setVitesse(valeur);
        if (videoRef.current) videoRef.current.playbackRate = valeur;
        setShowSettings(false);
    };

    // Init IMA
    useEffect(() => {
        if (!runAds) return;
        let cancelled = false;
        (async () => {
            try {
                const ima = await Promise.race([
                    loadIma(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
                ]);
                if (!ima || cancelled) throw new Error("IMA unavailable");
                startAds(ima);
            } catch (e) {
                console.warn("IMA failed, falling back:", e);
                setAdsBlocked(true);
                setAdsFinished(true);
            }
        })();
        return () => {
            cancelled = true;
            if (adsManagerRef.current) {
                adsManagerRef.current.destroy();
                adsManagerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startAds = (ima) => {
        const video = videoRef.current;
        const adContainer = adContainerRef.current;
        if (!video || !adContainer) return;
        const adDisplayContainer = new ima.AdDisplayContainer(adContainer, video);
        adDisplayContainer.initialize();
        const adsLoader = new ima.AdsLoader(adDisplayContainer);
        adsLoaderRef.current = adsLoader;

        adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
            const settings = new ima.AdsRenderingSettings();
            settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
            const adsManager = e.getAdsManager(video, settings);
            adsManagerRef.current = adsManager;

            adsManager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
                setAdsRunning(true);
                video.pause();
            });
            adsManager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, () => {
                setAdsRunning(false);
                setAdsFinished(true);
                video.play().catch(() => { });
            });
            adsManager.addEventListener(ima.AdEvent.Type.STARTED, (ev) => {
                const ad = ev.getAd();
                const pod = ad.getAdPodInfo();
                setAdInfo({
                    index: pod.getAdPosition(),
                    total: pod.getTotalAds(),
                    skippable: ad.isSkippable && ad.isSkippable(),
                });
            });
            adsManager.addEventListener(ima.AdEvent.Type.AD_PROGRESS, (ev) => {
                const d = ev.getAdData();
                setAdInfo((prev) => ({ ...(prev || {}), remainingTime: Math.max(0, Math.floor(d.duration - d.currentTime)) }));
            });
            adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
                setAdsRunning(false);
                setAdsFinished(true);
            });
            adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
                setAdsRunning(false);
                setAdsFinished(true);
            });

            try {
                const w = wrapRef.current?.clientWidth || 1280;
                const h = wrapRef.current?.clientHeight || 720;
                adsManager.init(w, h, ima.ViewMode.NORMAL);
                adsManager.start();
            } catch (err) {
                setAdsRunning(false);
                setAdsFinished(true);
            }
        });

        adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
            setAdsRunning(false);
            setAdsFinished(true);
        });

        const adsRequest = new ima.AdsRequest();
        adsRequest.adTagUrl = AD_TAG_URL.endsWith("correlator=") ? AD_TAG_URL + Date.now() : AD_TAG_URL;
        adsRequest.linearAdSlotWidth = wrapRef.current?.clientWidth || 1280;
        adsRequest.linearAdSlotHeight = wrapRef.current?.clientHeight || 720;
        adsLoader.requestAds(adsRequest);
    };

    const skipAd = () => {
        try {
            adsManagerRef.current?.skip();
        } catch (e) {
            setAdsRunning(false);
            setAdsFinished(true);
        }
    };

    // Lancement de la vidéo une fois les publicités passées. Cet effet dépendait
    // de l'état de lecture : chaque pause le rejouait et relançait aussitôt la
    // vidéo, rendant la mise en pause impossible. Le drapeau n'est plus levé qu'au
    // premier démarrage réussi, ou dès que la lecture est commandée à la main.
    const demarrerSiPossible = useCallback(() => {
        const video = videoRef.current;
        if (!adsFinished || demarrageAuto.current || !video) return;
        // La tentative peut échouer tant que le flux n'est pas rattaché, ou si le
        // navigateur refuse une lecture non sollicitée : on réessaie à « canplay ».
        video.play().then(() => { demarrageAuto.current = true; }).catch(() => { });
    }, [adsFinished]);

    useEffect(() => { demarrerSiPossible(); }, [demarrerSiPossible]);

    // Change quality preserves position
    const changeQuality = (q) => {
        if (!videoRef.current) return;
        const time = videoRef.current.currentTime;
        const wasPlaying = !videoRef.current.paused;
        const found = availableQualities.find((s) => s.quality === q);
        if (!found) return;
        setCurrentQuality(q);
        setSrc(found.url);
        setShowSettings(false);
        // After src change, restore time
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.currentTime = time;
                if (wasPlaying) videoRef.current.play().catch(() => { });
            }
        }, 100);
    };

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        // Commander la lecture soi-même clôt le démarrage automatique : sans
        // cela, une pause suivie d'un saut le relancerait.
        demarrageAuto.current = true;
        if (v.paused) v.play(); else v.pause();
    };
    const toggleMute = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setMuted(v.muted);
    };
    const setVol = (val) => {
        const v = videoRef.current;
        if (!v) return;
        v.volume = val;
        v.muted = val === 0;
        setVolume(val);
        setMuted(val === 0);
    };
    const seek = (val) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = (val / 100) * v.duration;
    };
    const skip = (delta) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    };
    const toggleFs = async () => {
        const el = wrapRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            await el.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    };

    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    const onLoadedMetadata = () => {
        if (startAt > 0 && videoRef.current) videoRef.current.currentTime = startAt;
        setDuration(videoRef.current?.duration || 0);
    };
    const onTimeUpdate = () => {
        if (!videoRef.current) return;
        setProgress(videoRef.current.currentTime);
        if (progressTimer.current) return;
        progressTimer.current = setTimeout(() => {
            onProgress && onProgress(videoRef.current?.currentTime || 0, videoRef.current?.duration || 0);
            progressTimer.current = null;
        }, 5000);
    };

    // Mouse move to show controls
    const bumpControls = useCallback(() => {
        setShowControls(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
            if (playing) setShowControls(false);
        }, 3000);
    }, [playing]);

    return (
        <div
            ref={wrapRef}
            data-testid="video-player-wrapper"
            className="relative w-full aspect-video bg-black rounded-lg overflow-hidden group"
            onMouseMove={bumpControls}
            onMouseLeave={() => playing && setShowControls(false)}
        >
            <video
                ref={videoRef}
                data-testid="video-player"
                src={manifestUrl ? undefined : src}
                crossOrigin={manifestUrl ? "anonymous" : undefined}
                poster={poster}
                className="w-full h-full"
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={onTimeUpdate}
                onCanPlay={demarrerSiPossible}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onClick={() => !adsRunning && togglePlay()}
                playsInline
            />

            {/* Ad container overlay */}
            <div
                ref={adContainerRef}
                data-testid="ad-container"
                className={`absolute inset-0 z-10 pointer-events-${adsRunning ? "auto" : "none"}`}
                style={{ display: adsRunning ? "block" : "none" }}
            />

            {/* Ad HUD */}
            {adsRunning && (
                <div className="absolute inset-0 z-20 pointer-events-none">
                    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs uppercase tracking-widest text-white/90 pointer-events-auto">
                        Publicité {adInfo?.index || 1}/{adInfo?.total || 1}
                        {adInfo?.remainingTime != null && ` · ${adInfo.remainingTime}s`}
                    </div>
                    <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto">
                        <Link
                            to="/pricing"
                            data-testid="remove-ads-btn"
                            className="flex items-center gap-1.5 text-xs bg-[#E8D2A6] text-black px-3 py-2 rounded-full font-semibold hover:bg-[#D4BB8B]"
                        >
                            <Zap size={12} /> Supprimer les pubs
                        </Link>
                        {adInfo?.skippable && (
                            <button onClick={skipAd} data-testid="skip-ad-btn" className="flex items-center gap-1.5 text-xs bg-white/10 backdrop-blur-md border border-white/20 text-white px-3 py-2 rounded-full hover:bg-white/20">
                                Passer <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Controls */}
            {!adsRunning && (
                <div
                    className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300 ${showControls || !playing ? "opacity-100" : "opacity-0"}`}
                >
                    <div className="bg-gradient-to-t from-black/95 via-black/40 to-transparent pt-16 pb-4 px-5">
                        {/* Progress bar */}
                        <div className="mb-3 flex items-center gap-3 text-xs text-white/80">
                            <span>{fmt(progress)}</span>
                            <input
                                data-testid="player-seek"
                                type="range"
                                min="0"
                                max="100"
                                value={duration ? (progress / duration) * 100 : 0}
                                onChange={(e) => seek(Number(e.target.value))}
                                className="flex-1 accent-[#E8D2A6] cursor-pointer"
                            />
                            <span>{fmt(duration)}</span>
                        </div>
                        {/* Buttons */}
                        <div className="flex items-center gap-3 text-white">
                            <button data-testid="player-play" onClick={togglePlay} className="hover:text-[#E8D2A6]">
                                {playing ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
                            </button>
                            <button onClick={() => skip(-10)} className="hover:text-[#E8D2A6]">
                                <SkipBack size={18} />
                            </button>
                            <button onClick={() => skip(10)} className="hover:text-[#E8D2A6]">
                                <SkipForward size={18} />
                            </button>
                            <div className="flex items-center gap-2">
                                <button onClick={toggleMute} className="hover:text-[#E8D2A6]">
                                    {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={muted ? 0 : volume}
                                    onChange={(e) => setVol(Number(e.target.value))}
                                    className="w-20 accent-[#E8D2A6] cursor-pointer"
                                />
                                {boost > 1 && (
                                    <span className="rounded-full bg-[#E8D2A6]/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#E8D2A6]">
                                        x{boost.toFixed(1)}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1" />
                            <div className="relative">
                                <button
                                    data-testid="player-settings"
                                    onClick={() => setShowSettings((s) => !s)}
                                    className="flex items-center gap-1.5 hover:text-[#E8D2A6] text-sm"
                                >
                                    <Settings size={18} />
                                    <span className="text-xs uppercase tracking-widest">
                                        {niveaux.length > 0
                                            ? (niveauChoisi === -1
                                                ? (niveauActif ? `Auto ${niveauActif}p` : "Auto")
                                                : `${niveaux[niveauChoisi]?.height}p`)
                                            : currentQuality}
                                    </span>
                                </button>
                                {showSettings && (
                                    <div
                                        data-testid="quality-menu"
                                        className="absolute bottom-full right-0 z-30 mb-2 max-h-[min(60vh,300px)] min-w-[220px] overflow-y-auto rounded-lg border border-[#262626] bg-[#0a0a0a] shadow-2xl"
                                    >
                                        <div className="sticky top-0 border-b border-[#262626] bg-[#0a0a0a] px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                            Qualité
                                        </div>
                                        {niveaux.length > 0 ? (
                                            <>
                                                <button
                                                    onClick={() => choisirNiveau(-1)}
                                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${niveauChoisi === -1 ? "text-[#E8D2A6]" : "text-white"}`}
                                                >
                                                    Automatique
                                                    {niveauChoisi === -1 && niveauActif ? ` · ${niveauActif}p` : ""}
                                                </button>
                                                {[...niveaux].reverse().map((n) => (
                                                    <button
                                                        key={n.index}
                                                        data-testid={`niveau-${n.height}`}
                                                        onClick={() => choisirNiveau(n.index)}
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${niveauChoisi === n.index ? "text-[#E8D2A6]" : "text-white"}`}
                                                    >
                                                        {n.height}p
                                                    </button>
                                                ))}
                                            </>
                                        ) : (
                                            <>
                                                {availableQualities.length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-neutral-500">Aucune option</div>
                                                )}
                                                {availableQualities.map((q) => (
                                                    <button
                                                        key={q.quality}
                                                        data-testid={`quality-${q.quality}`}
                                                        onClick={() => changeQuality(q.quality)}
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-white/5 ${currentQuality === q.quality ? "text-[#E8D2A6]" : "text-white"}`}
                                                    >
                                                        {q.quality.toUpperCase()}
                                                    </button>
                                                ))}
                                                {qualitySources
                                                    .filter((source) => !availableQualities.find((a) => a.quality === source.quality))
                                                    .map((q) => (
                                                        <Link
                                                            key={q.quality}
                                                            to="/pricing"
                                                            className="flex items-center justify-between border-t border-[#262626] px-3 py-2 text-sm text-neutral-500 hover:bg-white/5"
                                                        >
                                                            <span>{q.quality.toUpperCase()}</span>
                                                            <Zap size={12} className="text-[#E8D2A6]" />
                                                        </Link>
                                                    ))}
                                            </>
                                        )}

                                        <div className="border-y border-[#262626] px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                            Vitesse
                                        </div>
                                        <div className="grid grid-cols-3 gap-1 p-2">
                                            {VITESSES.map((v) => (
                                                <button
                                                    key={v}
                                                    data-testid={`vitesse-${v}`}
                                                    onClick={() => changerVitesse(v)}
                                                    className={`rounded px-2 py-1.5 text-xs tabular-nums transition-colors ${vitesse === v
                                                        ? "bg-[#E8D2A6] font-semibold text-black"
                                                        : "bg-white/5 text-neutral-300 hover:bg-white/10"}`}
                                                >
                                                    {v === 1 ? "Normal" : `${v}x`}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="border-t border-[#262626] px-3 py-2.5">
                                            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
                                                <span>Amplification</span>
                                                <span className="tabular-nums text-[#E8D2A6]">{Math.round(boost * 100)} %</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="2.5"
                                                step="0.1"
                                                value={boost}
                                                data-testid="player-boost"
                                                onChange={(e) => appliquerBoost(Number(e.target.value))}
                                                className="mt-2 w-full cursor-pointer accent-[#E8D2A6]"
                                            />
                                            <p className="mt-1.5 text-[10px] leading-snug text-neutral-600">
                                                Au-delà de 100 %, le son peut saturer selon la piste.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={toggleFs} className="hover:text-[#E8D2A6]">
                                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* À l'arrêt, la fiche du titre prend la place de l'image figée.
                Sans capture de clic : un clic n'importe où relance la lecture. */}
            {!playing && !adsRunning && fiche && (
                <div
                    data-testid="fiche-pause"
                    className="pointer-events-none absolute inset-0 z-20 flex items-center gap-5 bg-gradient-to-r from-black/90 via-black/60 to-transparent p-6 sm:p-10"
                >
                    {fiche.affiche && (
                        <img
                            src={fiche.affiche}
                            alt=""
                            className="hidden h-40 w-[112px] shrink-0 rounded-lg object-cover shadow-2xl ring-1 ring-white/10 sm:block"
                        />
                    )}
                    <div className="min-w-0 max-w-xl">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8D2A6]">En pause</div>
                        <h2 className="mt-1.5 font-display text-2xl leading-tight text-white sm:text-4xl">
                            {fiche.titre}
                        </h2>
                        {fiche.sousTitre && (
                            <div className="mt-1.5 text-sm text-neutral-400">{fiche.sousTitre}</div>
                        )}
                        {fiche.description && (
                            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-neutral-300 sm:line-clamp-4">
                                {fiche.description}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Center play when paused */}
            {!playing && !adsRunning && (
                <button
                    onClick={togglePlay}
                    aria-label="Lancer la lecture"
                    data-testid="player-center-play"
                    className="ym-play-surgit absolute bottom-24 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8D2A6]/95 shadow-2xl transition-transform duration-150 hover:scale-105 hover:bg-[#E8D2A6] sm:h-16 sm:w-16"
                >
                    <Play size={22} className="ml-1 text-black" fill="currentColor" />
                </button>
            )}
        </div>
    );
}
