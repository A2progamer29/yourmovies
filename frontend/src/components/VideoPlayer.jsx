import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, RotateCcw, RotateCw, Gauge, Zap, X } from "lucide-react";
import { Link } from "react-router-dom";
import PlayerLoading from "./PlayerLoading";
import PlayerSettings from "./PlayerSettings";
import PlayerPauseInfo from "./PlayerPauseInfo";
import "./VideoPlayer.css";
import { videoProtection, videoCrossOrigin } from "@/lib/videoProtection";
import { API } from "@/lib/api";

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
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m >= 60) return `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
    boostInitial = 1,
    downloadControl = null,
}) {
    const wrapRef = useRef(null);
    const videoRef = useRef(null);
    // Expose the internal video element to parents (e.g. Watch Party)
    useEffect(() => {
        if (videoRefOut) videoRefOut.current = videoRef.current;
        return () => { if (videoRefOut) videoRefOut.current = null; };
    }, [videoRefOut]);
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
    const initialSrc = preferred || availableQualities[0];

    const [currentQuality, setCurrentQuality] = useState(initialSrc?.quality || "720p");
    const [src, setSrc] = useState(initialSrc?.url || "");
    const [playing, setPlaying] = useState(false);
    const [paused, setPaused] = useState(false);
    const hasPlayed = useRef(false);
    const [buffering, setBuffering] = useState(true);
    const [playbackError, setPlaybackError] = useState(false);
    const [slow, setSlow] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const pendingSeek = useRef(startAt);
    const resumeAfterQuality = useRef(false);
    const fallbackRef = useRef(onFluxImpossible);
    fallbackRef.current = onFluxImpossible;
    const failPlayback = useCallback(() => {
        setBuffering(false);
        setPlaybackError(true);
        fallbackRef.current?.();
    }, []);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsSection, setSettingsSection] = useState("quality");
    const settingsPanelRef = useRef(null);
    const settingsTriggerRef = useRef(null);
    const speedTriggerRef = useRef(null);
    const settingsOpenerRef = useRef(null);
    const [buffered, setBuffered] = useState(0);
    const closeSettings = useCallback((restoreFocus = true) => {
        setShowSettings(false);
        setShowControls(true);
        if (restoreFocus) settingsOpenerRef.current?.focus();
    }, []);
    const openSettings = (section, trigger) => {
        settingsOpenerRef.current = trigger.current;
        setSettingsSection(section);
        setShowSettings(true);
    };
    useEffect(() => {
        if (!showSettings) return undefined;
        const outside = event => {
            if (![settingsPanelRef, settingsTriggerRef, speedTriggerRef].some(ref => ref.current?.contains(event.target))) closeSettings(false);
        };
        document.addEventListener("pointerdown", outside);
        return () => document.removeEventListener("pointerdown", outside);
    }, [showSettings, closeSettings]);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [compact, setCompact] = useState(false);
    const [narrow, setNarrow] = useState(false);
    const [adsRunning, setAdsRunning] = useState(false);
    const [adInfo, setAdInfo] = useState(null); // {remainingTime, skippable, canSkip, index, total}
    const [adsFinished, setAdsFinished] = useState(!runAds);
    const [adsBlocked, setAdsBlocked] = useState(false);
    const [boost, setBoost] = useState(Number(boostInitial) || 1);
    const [niveaux, setNiveaux] = useState([]);
    const [niveauChoisi, setNiveauChoisi] = useState(-1);
    const [vitesse, setVitesse] = useState(1);
    const hlsRef = useRef(null);
    const chaineAudio = useRef({ contexte: null, gain: null });
    const hideTimer = useRef(null);
    const demarrageAuto = useRef(false);
    const progressTimer = useRef(null);

    useEffect(() => {
        const element = wrapRef.current;
        if (!element) return undefined;
        const resize = () => { setCompact(element.clientWidth < 640); setNarrow(element.clientWidth < 360); };
        resize();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", resize);
            return () => window.removeEventListener("resize", resize);
        }
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setSrc(initialSrc?.url || "");
        setCurrentQuality(initialSrc?.quality || "720p");
        pendingSeek.current = startAt;
        demarrageAuto.current = false;
        setPlaying(false);
        setPaused(false);
        hasPlayed.current = false;
        setBuffering(true);
        setPlaybackError(false);
        setDuration(0);
        setProgress(0);
        setBuffered(0);
        setNiveaux([]);
        setNiveauChoisi(-1);
        // startAt is a resume hint; progress updates must not restart playback.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSrc?.url, initialSrc?.quality, manifestUrl]);

    useEffect(() => {
        setSlow(false);
        if (!buffering || playbackError) return undefined;
        const timer = setTimeout(() => setSlow(true), 15000);
        return () => clearTimeout(timer);
    }, [buffering, playbackError, retryCount]);

    useEffect(() => () => {
        clearTimeout(hideTimer.current);
        clearTimeout(progressTimer.current);
    }, []);

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
                    else failPlayback();
                    return;
                }
                instance = new Hls({ capLevelToPlayerSize: true });
                hlsRef.current = instance;
                instance.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (annule) return;
                    setNiveaux(instance.levels.map((n, index) => ({ index, height: n.height })));
                });
                // Le CDN peut refuser le flux selon le domaine d'où la page est
                // servie, ce que le serveur ne peut pas deviner. Plutôt qu'un
                // écran noir, on rend la main au lecteur intégré.
                instance.on(Hls.Events.ERROR, (_evenement, donnees) => {
                    if (annule || !donnees?.fatal) return;
                    failPlayback();
                });
                instance.loadSource(manifestUrl);
                instance.attachMedia(video);
            } catch {
                // hls.js n'a pas pu être chargé : on tente la lecture native,
                // et à défaut le lecteur intégré reprend la main.
                if (annule) return;
                if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = manifestUrl;
                else failPlayback();
            }
        })();

        return () => {
            annule = true;
            if (instance) instance.destroy();
            hlsRef.current = null;
        };
    }, [manifestUrl, retryCount, failPlayback]);

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
    // L'amplification demandée s'applique sans attendre : changer le réglage
    // pendant la lecture doit s'entendre tout de suite. Le graphe audio n'est
    // construit qu'une fois la lecture lancée — avant le premier geste, le
    // navigateur garderait le contexte suspendu et la vidéo deviendrait muette.
    useEffect(() => {
        const souhaite = Number(boostInitial) || 1;
        setBoost(souhaite);
        if (!playing && !chaineAudio.current.contexte) return;
        appliquerBoost(souhaite);
    }, [boostInitial, playing, appliquerBoost]);

    const choisirNiveau = (index) => {
        setNiveauChoisi(index);
        const hls = hlsRef.current;
        if (hls) {
            hls.capLevelToPlayerSize = index === -1;
            hls.autoLevelCapping = -1;
            hls.currentLevel = index;
        }
        closeSettings();
    };

    const changerVitesse = (valeur) => {
        setVitesse(valeur);
        if (videoRef.current) videoRef.current.playbackRate = valeur;
        closeSettings();
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
        video.play().then(() => { demarrageAuto.current = true; }).catch((error) => {
            if (error?.name === "NotAllowedError") {
                demarrageAuto.current = true;
                setBuffering(false);
            }
        });
    }, [adsFinished]);

    useEffect(() => { demarrerSiPossible(); }, [demarrerSiPossible]);

    // Change quality preserves position
    const changeQuality = (q) => {
        if (!videoRef.current) return;
        const time = videoRef.current.currentTime;
        const wasPlaying = !videoRef.current.paused;
        const found = availableQualities.find((s) => s.quality === q);
        if (!found) return;
        if (found.url === src) { closeSettings(); return; }
        setCurrentQuality(q);
        setSrc(found.url);
        closeSettings();
        pendingSeek.current = time;
        resumeAfterQuality.current = wasPlaying;
        setBuffering(true);
        setPlaybackError(false);
    };

    const retryPlayback = () => {
        pendingSeek.current = videoRef.current?.currentTime || startAt;
        demarrageAuto.current = false;
        setPlaybackError(false);
        setBuffering(true);
        setSlow(false);
        setRetryCount(n => n + 1);
        if (!manifestUrl) videoRef.current?.load();
    };

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        // Commander la lecture soi-même clôt le démarrage automatique : sans
        // cela, une pause suivie d'un saut le relancerait.
        demarrageAuto.current = true;
        if (v.paused) {
            v.play().catch((error) => {
                setBuffering(false);
                if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") failPlayback();
            });
        } else v.pause();
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
        if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
        v.currentTime = (val / 100) * v.duration;
    };
    const skip = (delta) => {
        const v = videoRef.current;
        if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    };
    const toggleFs = async () => {
        const el = wrapRef.current;
        if (!el) return;
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (el.requestFullscreen) await el.requestFullscreen();
            else videoRef.current?.webkitEnterFullscreen?.();
        } catch { /* Unsupported fullscreen must not interrupt playback. */ }
    };

    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    const onLoadedMetadata = () => {
        const video = videoRef.current;
        const length = Number.isFinite(video?.duration) ? video.duration : 0;
        setDuration(length);
        if (video && length > 0 && pendingSeek.current != null) {
            video.currentTime = Math.max(0, Math.min(pendingSeek.current, Math.max(0, length - 0.1)));
            pendingSeek.current = null;
        }
        if (video) video.playbackRate = vitesse;
        if (resumeAfterQuality.current) {
            resumeAfterQuality.current = false;
            video?.play().catch(() => setBuffering(false));
        }
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
            if (playing && !showSettings && !wrapRef.current?.contains(document.activeElement)) setShowControls(false);
        }, 3000);
    }, [playing, showSettings]);

    useEffect(() => {
        bumpControls();
        return () => clearTimeout(hideTimer.current);
    }, [bumpControls]);

    const percent = duration ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;
    const controlsVisible = showControls || !playing || showSettings || buffering;
    const showPauseInfo = paused && !playing && !buffering && !playbackError && !adsRunning && !showSettings && Boolean(fiche);

    return (
        <div
            ref={wrapRef}
            data-testid="video-player-wrapper"
            className="ym-player"
            data-compact={compact}
            data-narrow={narrow}
            data-paused-info={showPauseInfo}
            data-controls={controlsVisible ? "visible" : "hidden"}
            tabIndex={0}
            role="region"
            aria-label="Lecteur vidéo"
            onContextMenu={videoProtection.onContextMenu}
            onMouseMove={bumpControls}
            onTouchStart={bumpControls}
            onFocus={bumpControls}
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget || adsRunning) return;
                const action = { " ": togglePlay, k: togglePlay, m: toggleMute, f: toggleFs, ArrowLeft: () => skip(-10), ArrowRight: () => skip(10), Escape: () => closeSettings() }[event.key];
                if (action) { event.preventDefault(); bumpControls(); action(); }
            }}
        >
            <video
                {...videoProtection}
                preload="metadata"
                ref={videoRef}
                data-testid="video-player"
                src={manifestUrl ? undefined : src}
                crossOrigin={videoCrossOrigin(manifestUrl || src, API) || (manifestUrl ? "anonymous" : undefined)}
                poster={poster}
                className="w-full h-full"
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={onTimeUpdate}
                onProgress={() => {
                    const video = videoRef.current;
                    if (video?.buffered.length && Number.isFinite(video.duration) && video.duration > 0) {
                        setBuffered(Math.min(100, video.buffered.end(video.buffered.length - 1) / video.duration * 100));
                    }
                }}
                onLoadStart={() => { setBuffering(true); setPlaybackError(false); }}
                onWaiting={() => setBuffering(true)}
                onStalled={() => { if (videoRef.current?.readyState < 3) setBuffering(true); }}
                onSeeking={() => setBuffering(true)}
                onSeeked={() => { if (videoRef.current?.readyState >= 2) setBuffering(false); }}
                onCanPlay={() => { setBuffering(false); demarrerSiPossible(); }}
                onPlay={() => { setPlaying(true); setPaused(false); }}
                onPlaying={() => { hasPlayed.current = true; setPaused(false); setPlaying(true); setBuffering(false); setPlaybackError(false); bumpControls(); }}
                onPause={() => { setPaused(hasPlayed.current && !videoRef.current?.ended); setPlaying(false); setShowControls(true); }}
                onEnded={() => { setPaused(false); setPlaying(false); setBuffering(false); }}
                onError={failPlayback}
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

            {buffering && !playbackError && !adsRunning && <PlayerLoading overlay label={slow ? "Le chargement prend plus de temps…" : "Chargement de la vidéo…"} />}
            {(playbackError || (buffering && slow)) && !adsRunning && (
                <div role={playbackError ? "alert" : undefined} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/90 px-5 text-center">
                    <p className="text-sm text-neutral-200">{playbackError ? "La vidéo n’a pas pu être chargée." : "Le flux met du temps à répondre."}</p>
                    <button type="button" onClick={retryPlayback} className="rounded-full bg-[#E8D2A6] px-5 py-2.5 text-sm font-semibold text-black">Réessayer</button>
                </div>
            )}
            {showPauseInfo && <PlayerPauseInfo fiche={fiche} />}
            {!adsRunning && (
                <>
                    <div className="ym-player-brand" aria-hidden="true">
                        <div className="ym-player-top-title"><strong>{fiche?.titre}</strong><span>{fiche?.sousTitre}</span></div>
                    </div>
                    <div className="ym-player-controls">
                        <div className="ym-player-progress-row">
                            <div className="ym-player-timeline" style={{ "--played": `${percent}%`, "--buffered": `${buffered}%` }}>
                                <div className="ym-player-timeline-track" />
                                <div className="ym-player-timeline-buffer" />
                                <input data-testid="player-seek" aria-label="Position de lecture" aria-valuetext={`${fmt(progress)} sur ${fmt(duration)}`}
                                    type="range" min="0" max="100" step="0.1" value={percent} disabled={!duration || playbackError}
                                    onChange={event => seek(Number(event.target.value))} className="ym-player-seek" />
                            </div>
                            <span className="ym-player-time" aria-label={`Temps restant : ${fmt(Math.max(0, duration - progress))}`}>
                                −{fmt(Math.max(0, duration - progress))}
                            </span>
                        </div>
                        <div className="ym-player-toolbar">
                            <div className="ym-player-toolbar-group">
                                <button type="button" data-testid="player-play" aria-label={playing ? "Mettre en pause" : "Lire"}
                                    data-tooltip={playing ? "Pause (Espace)" : "Lecture (Espace)"} onClick={togglePlay} className="ym-player-button">
                                    {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                                </button>
                                <button type="button" aria-label="Reculer de 10 secondes" data-tooltip="Reculer de 10 s" onClick={() => skip(-10)} className="ym-player-button">
                                    <span className="ym-player-skip" aria-hidden="true"><RotateCcw /><span>10</span></span>
                                </button>
                                <button type="button" aria-label="Avancer de 10 secondes" data-tooltip="Avancer de 10 s" onClick={() => skip(10)} className="ym-player-button">
                                    <span className="ym-player-skip" aria-hidden="true"><RotateCw /><span>10</span></span>
                                </button>
                                <div className="ym-player-volume">
                                    <button type="button" aria-label={muted ? "Activer le son" : "Couper le son"} data-tooltip="Volume (M)" onClick={toggleMute} className="ym-player-button">
                                        {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
                                    </button>
                                    {!compact && <div className="ym-player-volume-panel">
                                        <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="Volume"
                                            onChange={event => setVol(Number(event.target.value))} />
                                    </div>}
                                </div>
                            </div>
                            <div className="ym-player-title">
                                <strong>{fiche?.titre || "Votre séance"}</strong>
                                {fiche?.sousTitre && <span>{fiche.sousTitre}</span>}
                            </div>
                            <div className="ym-player-toolbar-group">
                                {!compact && <button type="button" ref={speedTriggerRef} aria-label="Vitesse de lecture" data-tooltip="Vitesse de lecture"
                                    aria-expanded={showSettings && settingsSection === "speed"} aria-haspopup="dialog"
                                    onClick={() => showSettings && settingsSection === "speed" ? closeSettings() : openSettings("speed", speedTriggerRef)} className="ym-player-button">
                                    <Gauge />{vitesse !== 1 && <span className="ym-player-speed-badge">{vitesse}×</span>}
                                </button>}
                                {downloadControl}
                                <button type="button" ref={settingsTriggerRef} data-testid="player-settings" aria-label="Réglages de lecture"
                                    data-tooltip="Réglages" aria-expanded={showSettings} aria-haspopup="dialog"
                                    onClick={() => showSettings ? closeSettings() : openSettings("quality", settingsTriggerRef)} className="ym-player-button">
                                    <Settings />
                                </button>
                                <button type="button" aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"} data-tooltip="Plein écran (F)" onClick={toggleFs} className="ym-player-button">
                                    {isFullscreen ? <Minimize /> : <Maximize />}
                                </button>
                            </div>
                        </div>
                    </div>
                    {showSettings && <PlayerSettings panelRef={settingsPanelRef} section={settingsSection} onSection={setSettingsSection} onClose={closeSettings}
                        levels={niveaux} level={niveauChoisi} onLevel={choisirNiveau} qualities={availableQualities} allQualities={qualitySources}
                        quality={currentQuality} onQuality={changeQuality} speed={vitesse} onSpeed={changerVitesse}
                        volume={volume} muted={muted} onVolume={setVol} boost={boost} onBoost={appliquerBoost} />}
                </>
            )}
            {!playing && !buffering && !playbackError && !adsRunning && !showSettings && (
                <button type="button" onClick={togglePlay} aria-label="Lancer la lecture" data-testid="player-center-play" className="ym-player-center">
                    <Play fill="currentColor" />
                </button>
            )}
        </div>
    );
}
