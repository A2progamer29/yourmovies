import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Users, Play, Film, ListVideo, X, Clock3 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import VideoPlayer from "@/components/VideoPlayer";
import WatchParty from "@/components/WatchParty";
import PreRollAd from "@/components/PreRollAd";

const PLAN_MAX_QUALITY = {
    null: "720p",
    undefined: "720p",
    basic: "1080p",
    standard: "1080p",
    premium: "4k",
};

const BUNNY_LIBRARY_ID = process.env.REACT_APP_BUNNY_LIBRARY_ID || "719915";


function resolveBunnySource(media) {
    if (!media) return null;
    const candidates = [media.bunny_video_id, media.video_url].filter(Boolean);

    for (const value of candidates) {
        const raw = String(value).trim();
        if (!raw) continue;

        try {
            const url = new URL(raw);
            const match = url.pathname.match(/\/(?:embed|play)\/(\d+)\/([a-zA-Z0-9-]+)/);
            if (match) return { libraryId: match[1], videoId: match[2] };
            const videoId = url.searchParams.get("videoId") || url.searchParams.get("video_id");
            const libraryId = url.searchParams.get("libraryId") || url.searchParams.get("library_id");
            if (videoId) {
                return {
                    libraryId: String(libraryId || media.bunny_library_id || BUNNY_LIBRARY_ID),
                    videoId,
                };
            }
        } catch {
            // A raw Bunny GUID is the preferred stored format.
        }

        if (/^[a-zA-Z0-9-]{12,}$/.test(raw) && !raw.includes("/")) {
            return {
                libraryId: String(media.bunny_library_id || BUNNY_LIBRARY_ID),
                videoId: raw,
            };
        }
    }

    return null;
}

function fallbackQualities(media) {
    if (media.qualities && media.qualities.length > 0) {
        return media.qualities.map((q) => ({
            quality: q.quality,
            url: q.url || (q.file_path ? `${API}/files/${q.file_path}` : null),
        })).filter((q) => q.url);
    }
    const single = media.video_url || (media.video_file_path ? `${API}/files/${media.video_file_path}` : null);
    if (!single) return [];
    return [{ quality: "720p", url: single }];
}


function formatEpisodeDuration(episode) {
    const raw = episode?.duration_minutes ?? episode?.duration;
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "string" && raw.includes(":")) return raw;
    const minutes = Number.parseFloat(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    return Math.round(minutes) + " min";
}

function getEpisodeProgress(episode, watchProgress) {
    if (!episode || !watchProgress) return 0;
    const isSameEpisode = String(watchProgress.season_number) === String(episode.season_number)
        && String(watchProgress.episode_number) === String(episode.ep_number);
    if (!isSameEpisode) return 0;
    const position = Number(watchProgress.position_seconds || 0);
    const duration = Number(watchProgress.duration_seconds || 0);
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (position / duration) * 100));
}

function EpisodeSelectorOverlay({
    open,
    onOpenChange,
    seasons,
    seasonEpisodes,
    selectedEpisode,
    selectedSeasonNumber,
    previousEpisode,
    nextEpisode,
    watchProgress,
    onSeasonChange,
    onEpisodeSelect,
}) {
    const currentLabel = selectedEpisode
        ? "S" + selectedEpisode.season_number + " E" + selectedEpisode.ep_number
        : "Épisodes";

    return (
        <>
            <button
                type="button"
                onClick={() => onOpenChange(true)}
                aria-label="Choisir une saison ou un épisode"
                aria-expanded={open}
                aria-controls="episode-selector-panel"
                data-testid="episode-selector-open"
                className="absolute right-3 top-3 z-[35] flex h-10 items-center gap-2 rounded-full border border-white/15 bg-black/80 px-3 text-xs font-medium text-white shadow-xl backdrop-blur-md transition-colors hover:border-[#E8D2A6]/70 hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#E8D2A6]/70 sm:right-4 sm:top-4 sm:px-4"
            >
                <ListVideo size={16} className="text-[#E8D2A6]" />
                <span className="hidden sm:inline">Épisodes</span>
                <span className="rounded-full bg-[#E8D2A6]/15 px-2 py-0.5 text-[#E8D2A6]">{currentLabel}</span>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        id="episode-selector-panel"
                        className="absolute inset-0 z-[60] flex items-end overflow-hidden rounded-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                    >
                        <button
                            type="button"
                            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
                            onClick={() => onOpenChange(false)}
                            aria-label="Fermer le choix des épisodes"
                        />
                        <motion.section
                            role="dialog"
                            aria-modal="true"
                            aria-label="Saisons et épisodes"
                            onClick={(event) => event.stopPropagation()}
                            initial={{ y: 36, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 24, opacity: 0 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="relative z-10 w-full max-h-[94%] overflow-y-auto border-t border-[#E8D2A6]/25 bg-gradient-to-b from-[#15130f]/98 to-[#080808]/[0.99] px-3 pb-3 pt-3 shadow-[0_-18px_55px_rgba(0,0,0,0.65)] [scrollbar-color:#E8D2A6_#171717] [scrollbar-width:thin] sm:px-5 sm:pb-5 sm:pt-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#E8D2A6]">
                                        <ListVideo size={13} />
                                        Lecture en cours
                                    </div>
                                    <div className="mt-1 truncate text-sm font-semibold text-white sm:text-base">
                                        {selectedEpisode
                                            ? "Saison " + selectedEpisode.season_number + " · Épisode " + selectedEpisode.ep_number + " — " + (selectedEpisode.title || "Sans titre")
                                            : "Choisissez un épisode"}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        type="button"
                                        disabled={!previousEpisode}
                                        onClick={() => previousEpisode && onEpisodeSelect(previousEpisode)}
                                        aria-label="Épisode précédent"
                                        title="Épisode précédent"
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#333] bg-black/30 text-white transition-colors hover:border-[#E8D2A6]/60 hover:text-[#E8D2A6] disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        <ChevronLeft size={17} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!nextEpisode}
                                        onClick={() => nextEpisode && onEpisodeSelect(nextEpisode)}
                                        aria-label="Épisode suivant"
                                        title="Épisode suivant"
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#333] bg-black/30 text-white transition-colors hover:border-[#E8D2A6]/60 hover:text-[#E8D2A6] disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        <ChevronRight size={17} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onOpenChange(false)}
                                        aria-label="Fermer"
                                        className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-[#333] bg-black/30 text-neutral-300 transition-colors hover:border-[#E8D2A6]/60 hover:text-white"
                                    >
                                        <X size={17} />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {(seasons || []).map((season) => {
                                    const seasonNumber = String(season.season_number);
                                    const isActive = selectedSeasonNumber === seasonNumber;
                                    return (
                                        <button
                                            key={seasonNumber}
                                            type="button"
                                            onClick={() => onSeasonChange(seasonNumber)}
                                            className={"shrink-0 snap-start rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8D2A6]/60 sm:px-4 sm:py-2 sm:text-xs " + (
                                                isActive
                                                    ? "border-[#E8D2A6] bg-[#E8D2A6] text-black"
                                                    : "border-[#343434] bg-[#0d0d0d] text-neutral-300 hover:border-[#E8D2A6]/60 hover:text-white"
                                            )}
                                        >
                                            Saison {season.season_number}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-3 flex snap-x gap-2.5 overflow-x-auto pb-1 [scrollbar-color:#E8D2A6_#171717] [scrollbar-width:thin] sm:gap-3 sm:pb-2">
                                {seasonEpisodes.map((episode) => {
                                    const playable = Boolean(episode.bunny_video_id || episode.video_url || episode.video_file_path);
                                    const isActive = selectedEpisode?._key === episode._key;
                                    const duration = formatEpisodeDuration(episode);
                                    const progress = getEpisodeProgress(episode, watchProgress);
                                    return (
                                        <button
                                            key={episode._key}
                                            type="button"
                                            disabled={!playable}
                                            onClick={() => onEpisodeSelect(episode)}
                                            title={playable ? (episode.title || "Épisode " + episode.ep_number) : "Aucun fichier vidéo pour cet épisode"}
                                            className={"relative min-w-[12rem] snap-start overflow-hidden rounded-xl border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#E8D2A6]/70 sm:min-w-[16rem] " + (
                                                isActive
                                                    ? "border-[#E8D2A6] bg-[#E8D2A6]/12 text-white"
                                                    : playable
                                                        ? "border-[#2a2a2a] bg-[#0d0d0d]/95 text-neutral-300 hover:border-[#E8D2A6]/50 hover:bg-[#141414]"
                                                        : "cursor-not-allowed border-[#202020] bg-[#090909] text-neutral-600 opacity-60"
                                            )}
                                        >
                                            <span className="flex items-center gap-3">
                                                <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold " + (
                                                    isActive ? "bg-[#E8D2A6] text-black" : "bg-[#1d1d1d] text-neutral-400"
                                                )}>
                                                    {episode.ep_number}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                                                        Épisode {episode.ep_number}
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-xs font-medium sm:text-sm">
                                                        {episode.title || "Épisode " + episode.ep_number}
                                                    </span>
                                                </span>
                                                {isActive && <Play size={14} className="shrink-0 text-[#E8D2A6]" fill="currentColor" />}
                                            </span>

                                            {(duration || progress > 0) && (
                                                <span className="mt-2.5 flex items-center justify-between gap-3 text-[10px] text-neutral-500">
                                                    {duration ? (
                                                        <span className="flex items-center gap-1">
                                                            <Clock3 size={11} />
                                                            {duration}
                                                        </span>
                                                    ) : <span />}
                                                    {progress > 0 && progress < 95 && <span className="text-[#E8D2A6]">À reprendre</span>}
                                                    {progress >= 95 && <span className="text-[#E8D2A6]">Terminé</span>}
                                                </span>
                                            )}

                                            {progress > 0 && (
                                                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
                                                    <span className="block h-full bg-[#E8D2A6]" style={{ width: progress + "%" }} />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.section>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

export default function WatchPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, activeProfile } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [media, setMedia] = useState(null);
    const [selectedEpisodeKey, setSelectedEpisodeKey] = useState("");
    const [selectedSeason, setSelectedSeason] = useState("");
    const [resumeAt, setResumeAt] = useState(0);
    const [watchProgress, setWatchProgress] = useState(null);
    const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
    const [partyCode, setPartyCode] = useState(searchParams.get("party") || "");
    const [joinInput, setJoinInput] = useState("");
    const [partyOpen, setPartyOpen] = useState(Boolean(searchParams.get("party")));
    const videoElRef = useRef(null);
    const [bunnyPlaybackUrl, setBunnyPlaybackUrl] = useState(null);
    const [bunnyPlaybackError, setBunnyPlaybackError] = useState(null);
    const [adDone, setAdDone] = useState(false);
    const episodes = React.useMemo(() => (media?.seasons || []).flatMap((season) =>
        (season.episodes || []).map((episode) => ({
            ...episode,
            season_number: season.season_number,
            _key: `${season.season_number}:${episode.ep_number}`,
        }))
    ), [media]);
    const selectedEpisode = episodes.find((episode) => episode._key === selectedEpisodeKey)
        || episodes.find((episode) => episode.bunny_video_id || episode.video_url || episode.video_file_path)
        || episodes[0]
        || null;
    const selectedSeasonNumber = selectedSeason
        || String(selectedEpisode?.season_number ?? media?.seasons?.[0]?.season_number ?? "");
    const seasonEpisodes = episodes.filter(
        (episode) => String(episode.season_number) === selectedSeasonNumber
    );
    const playableEpisodes = episodes.filter(
        (episode) => episode.bunny_video_id || episode.video_url || episode.video_file_path
    );
    const selectedPlayableIndex = playableEpisodes.findIndex(
        (episode) => episode._key === selectedEpisode?._key
    );
    const previousEpisode = selectedPlayableIndex > 0
        ? playableEpisodes[selectedPlayableIndex - 1]
        : null;
    const nextEpisode = selectedPlayableIndex >= 0 && selectedPlayableIndex < playableEpisodes.length - 1
        ? playableEpisodes[selectedPlayableIndex + 1]
        : null;
    const selectEpisode = (episode) => {
        if (!episode) return;
        const isSameEpisode = selectedEpisode?._key === episode._key;
        setSelectedEpisodeKey(episode._key);
        setSelectedSeason(String(episode.season_number));
        setEpisodePanelOpen(false);

        const next = new URLSearchParams(searchParams);
        next.set("season", String(episode.season_number));
        next.set("episode", String(episode.ep_number));
        setSearchParams(next, { replace: true });

        const matchesSavedProgress = watchProgress
            && String(watchProgress.season_number) === String(episode.season_number)
            && String(watchProgress.episode_number) === String(episode.ep_number);
        setResumeAt(matchesSavedProgress && Number(watchProgress.position_seconds) > 5
            ? Number(watchProgress.position_seconds)
            : 0);

        if (!isSameEpisode) setAdDone(false);
    };
    const playbackMedia = media?.type === "movie" ? media : selectedEpisode;
    const bunnySource = resolveBunnySource(playbackMedia);

    useEffect(() => {
        if (!bunnySource?.videoId) {
            setBunnyPlaybackUrl(null);
            return;
        }
        let active = true;
        setBunnyPlaybackUrl(null);
        setBunnyPlaybackError(null);
        const playbackParams = media?.type === "movie" ? undefined : {
            season_number: selectedEpisode?.season_number,
            episode_number: selectedEpisode?.ep_number,
        };
        api.get(`/bunny/playback/${id}`, { params: playbackParams, silent: true })
            .then((response) => {
                if (!active) return;
                const data = response.data || {};
                if (!data.url) {
                    setBunnyPlaybackError("Le backend n’a renvoyé aucune URL de lecture.");
                    return;
                }
                if (data.libraryMatchesUploadConfig === false) {
                    setBunnyPlaybackError(
                        `Cette vidéo appartient à la bibliothèque Bunny ${data.libraryId}, mais Render est configuré pour une autre bibliothèque. Corrige BUNNY_LIBRARY_ID ou réimporte la vidéo.`
                    );
                    return;
                }
                setBunnyPlaybackUrl(data.url);
            })
            .catch((error) => {
                if (!active) return;
                const status = error?.response?.status;
                const detail = error?.response?.data?.detail;
                setBunnyPlaybackError(
                    detail || `Impossible d’obtenir l’autorisation Bunny${status ? ` (HTTP ${status})` : ""}. Vérifie Render et la sécurité de la bibliothèque Bunny.`
                );
            });
        return () => { active = false; };
    }, [
        id,
        media?.type,
        selectedEpisode?.season_number,
        selectedEpisode?.ep_number,
        bunnySource?.videoId,
        bunnySource?.libraryId,
    ]);

    useEffect(() => {
        (async () => {
            const r = await api.get(`/media/${id}`);
            setMedia(r.data);
            let initialEpisode = null;
            if (r.data.type !== "movie") {
                const allEpisodes = (r.data.seasons || []).flatMap((season) =>
                    (season.episodes || []).map((episode) => ({ ...episode, season_number: season.season_number }))
                );
                const requestedSeason = searchParams.get("season");
                const requestedEpisode = searchParams.get("episode");
                const requested = allEpisodes.find((episode) =>
                    String(episode.season_number) === String(requestedSeason)
                    && String(episode.ep_number) === String(requestedEpisode)
                    && (episode.bunny_video_id || episode.video_url || episode.video_file_path)
                );
                const firstPlayable = requested || allEpisodes.find((episode) =>
                    episode.bunny_video_id || episode.video_url || episode.video_file_path
                );
                if (firstPlayable) {
                    initialEpisode = firstPlayable;
                    setSelectedEpisodeKey(`${firstPlayable.season_number}:${firstPlayable.ep_number}`);
                    setSelectedSeason(String(firstPlayable.season_number));
                }
            }
            if (user) {
                try {
                    const p = await api.get("/watch-progress");
                    const item = p.data.find((x) => x.id === id);
                    setWatchProgress(item || null);
                    const appliesToInitialEpisode = r.data.type === "movie"
                        || (
                            initialEpisode
                            && String(item?.season_number) === String(initialEpisode.season_number)
                            && String(item?.episode_number) === String(initialEpisode.ep_number)
                        );
                    setResumeAt(item && appliesToInitialEpisode && Number(item.position_seconds) > 5
                        ? Number(item.position_seconds)
                        : 0);
                } catch (e) { }
            }
        })();
    }, [id, user]);

    const saveProgress = useCallback(async (pos, dur) => {
        if (!user) return;
        if (pos < 3) return;
        try {
            await api.post("/watch-progress", {
                media_id: id,
                position_seconds: pos,
                duration_seconds: dur,
                season_number: media?.type === "movie" ? null : selectedEpisode?.season_number,
                episode_number: media?.type === "movie" ? null : selectedEpisode?.ep_number,
            });
            setWatchProgress((current) => ({
                ...(current || {}),
                id,
                position_seconds: pos,
                duration_seconds: dur,
                season_number: media?.type === "movie" ? null : selectedEpisode?.season_number,
                episode_number: media?.type === "movie" ? null : selectedEpisode?.ep_number,
            }));
        } catch (e) { }
    }, [id, user, media?.type, selectedEpisode?.season_number, selectedEpisode?.ep_number]);

    const markEmbeddedPlaybackStarted = useCallback(async () => {
        if (!user || !media) return;
        const rawDuration = media.type === "movie"
            ? media.duration_minutes
            : (selectedEpisode?.duration_minutes ?? selectedEpisode?.duration ?? media.duration_minutes);
        const durationMinutes = Number.parseFloat(rawDuration);
        try {
            await api.post("/watch-progress/start", {
                media_id: id,
                duration_seconds: Number.isFinite(durationMinutes) && durationMinutes > 0
                    ? durationMinutes * 60
                    : null,
                season_number: media.type === "movie" ? null : selectedEpisode?.season_number,
                episode_number: media.type === "movie" ? null : selectedEpisode?.ep_number,
            }, { silent: true });
        } catch (e) { }
    }, [
        id,
        user,
        media,
        selectedEpisode?.duration,
        selectedEpisode?.duration_minutes,
        selectedEpisode?.season_number,
        selectedEpisode?.ep_number,
    ]);

    const createParty = async () => {
        if (!user) { navigate("/login"); return; }
        try {
            const r = await api.post("/party/create", { media_id: id });
            setPartyCode(r.data.code);
            setPartyOpen(true);
            const next = new URLSearchParams(searchParams);
            next.set("party", r.data.code);
            setSearchParams(next, { replace: true });
        } catch (e) { showError(toast, e, "Impossible de créer le salon"); }
    };

    const joinParty = () => {
        if (!user) { navigate("/login"); return; }
        if (!joinInput.trim()) return;
        const code = joinInput.trim().toUpperCase();
        setPartyCode(code);
        setPartyOpen(true);
        const next = new URLSearchParams(searchParams);
        next.set("party", code);
        setSearchParams(next, { replace: true });
    };

    const closeParty = () => {
        setPartyOpen(false);
        setPartyCode("");
        const next = new URLSearchParams(searchParams);
        next.delete("party");
        setSearchParams(next, { replace: true });
    };

    if (media?.in_theaters && searchParams.get("cinema-warning") !== "accepted") {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4" role="dialog" aria-modal="true" aria-labelledby="cinema-warning-title">
                    <div className="w-full max-w-lg rounded-2xl border border-[#E8D2A6]/30 bg-[#0a0a0a] p-7 text-center shadow-2xl">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#E8D2A6]/40 bg-[#E8D2A6]/10"><Film size={25} className="text-[#E8D2A6]" /></div>
                        <h2 id="cinema-warning-title" className="mt-5 font-display text-3xl tracking-tight">Film actuellement au cinéma</h2>
                        <p className="mt-3 text-sm leading-relaxed text-neutral-400">Ce film vient de sortir au cinéma. La version disponible peut donc ne pas être proposée dans une qualité optimale.</p>
                        <div className="mt-7 flex flex-col-reverse justify-center gap-3 sm:flex-row">
                            <Button variant="outline" onClick={() => navigate(`/media/${media.id}`)} className="rounded-full border-[#333] bg-transparent px-6 text-white hover:bg-white/5">Retour à la fiche</Button>
                            <Button onClick={() => { const next = new URLSearchParams(searchParams); next.set("cinema-warning", "accepted"); setSearchParams(next, { replace: true }); }} className="rounded-full bg-[#E8D2A6] px-6 font-semibold text-black hover:bg-[#D4BB8B]">Continuer quand même</Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!media) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-7xl mx-auto px-6 py-20">Chargement...</div>
            </div>
        );
    }

    const qualities = fallbackQualities(playbackMedia);
    const userMaxQuality = "4k";
    const runAds = !user?.premium;
    const hasVideo = !!(bunnySource || qualities.length > 0);
    const showAd = runAds && !partyOpen && !adDone && hasVideo;
    const token = typeof window !== "undefined" ? localStorage.getItem("ym_token") : null;

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-7xl mx-auto px-6 py-8">
                <button
                    onClick={() => navigate(-1)}
                    data-testid="back-btn"
                    className="flex items-center gap-1 text-neutral-400 hover:text-[#E8D2A6] transition-colors mb-6"
                >
                    <ChevronLeft size={16} /> Retour
                </button>
                <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
                    <h1 className="font-display text-3xl sm:text-4xl">{media.title}</h1>
                    <div className="flex items-center gap-2">
                        {!partyOpen ? (
                            <>
                                <Button
                                    onClick={createParty}
                                    data-testid="party-create-btn"
                                    className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-10 px-5"
                                >
                                    <Users size={14} className="mr-2" /> {user ? "Watch Party" : "Se connecter pour une Watch Party"}
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Input
                                        data-testid="party-join-input"
                                        value={joinInput}
                                        onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                                        placeholder="Code"
                                        maxLength={6}
                                        className="bg-[#111] border-[#262626] text-white w-40 tracking-widest uppercase"
                                    />
                                    <Button variant="outline" onClick={joinParty} data-testid="party-join-btn" className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full h-10 px-4">
                                        Rejoindre
                                    </Button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
                    <div>
                        <div className="relative">
                            {showAd ? (
                            <div className="relative w-full rounded-lg overflow-hidden border border-[#262626]" style={{ aspectRatio: "16 / 9" }}>
                                <PreRollAd onDone={() => setAdDone(true)} />
                            </div>
                        ) : bunnySource ? (
                            <div className="relative w-full rounded-lg overflow-hidden border border-[#262626]" style={{ aspectRatio: "16 / 9" }}>
                                {bunnyPlaybackError ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-[#050505] p-6">
                                        <div className="max-w-xl text-center">
                                            <div className="font-display text-2xl text-white">Lecture indisponible</div>
                                            <p className="mt-3 text-sm leading-relaxed text-neutral-400">La vidéo ne peut pas être lancée pour le moment. Réessaie dans quelques instants.</p>
                                        </div>
                                    </div>
                                ) : bunnyPlaybackUrl ? (
                                    <iframe
                                        data-testid="bunny-player"
                                        src={bunnyPlaybackUrl}
                                        loading="eager"
                                        onLoad={markEmbeddedPlaybackStarted}
                                        className="absolute inset-0 w-full h-full"
                                        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                                        allowFullScreen
                                        referrerPolicy="strict-origin-when-cross-origin"
                                        title={media.title}
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-black" aria-hidden="true" />
                                )}
                            </div>
                        ) : qualities.length === 0 ? (
                            <div className="p-12 border border-[#262626] rounded-lg text-center text-neutral-400">
                                Aucun fichier vidéo disponible pour ce contenu.
                            </div>
                        ) : (
                            <VideoPlayer
                                qualitySources={qualities}
                                poster={media.banner_url || media.poster_url}
                                onProgress={saveProgress}
                                startAt={resumeAt}
                                userMaxQuality={userMaxQuality}
                                runAds={false}
                                preferredQuality={user?.preferred_quality}
                                videoRefOut={videoElRef}
                            />
                            )}

                            {media.type !== "movie" && episodes.length > 0 && (
                                <EpisodeSelectorOverlay
                                    open={episodePanelOpen}
                                    onOpenChange={setEpisodePanelOpen}
                                    seasons={media.seasons || []}
                                    seasonEpisodes={seasonEpisodes}
                                    selectedEpisode={selectedEpisode}
                                    selectedSeasonNumber={selectedSeasonNumber}
                                    previousEpisode={previousEpisode}
                                    nextEpisode={nextEpisode}
                                    watchProgress={watchProgress}
                                    onSeasonChange={setSelectedSeason}
                                    onEpisodeSelect={selectEpisode}
                                />
                            )}
                        </div>

                        {resumeAt > 0 && !bunnySource && (
                            <div className="mt-4 text-xs text-neutral-500">
                                Reprise à {Math.floor(resumeAt / 60)}m {Math.floor(resumeAt % 60)}s
                            </div>
                        )}

                        {(selectedEpisode?.description || media.description) && (
                            <p className="mt-8 text-neutral-300 leading-relaxed max-w-3xl">{selectedEpisode?.description || media.description}</p>
                        )}
                    </div>

                    {partyOpen && partyCode && (
                        <WatchParty
                            code={partyCode}
                            currentUserId={activeProfile ? `${user?.user_id}:${activeProfile.id}` : user?.user_id}
                            profileId={activeProfile?.id}
                            profileName={activeProfile?.name}
                            videoRef={videoElRef}
                            onClose={closeParty}
                            token={token}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
