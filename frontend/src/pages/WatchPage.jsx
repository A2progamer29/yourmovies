import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Users, Play, Film } from "lucide-react";
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

export default function WatchPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, activeProfile } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [media, setMedia] = useState(null);
    const [selectedEpisodeKey, setSelectedEpisodeKey] = useState("");
    const [selectedSeason, setSelectedSeason] = useState("");
    const [resumeAt, setResumeAt] = useState(0);
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
        setSelectedEpisodeKey(episode._key);
        setSelectedSeason(String(episode.season_number));
        setAdDone(false);
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
                    setSelectedEpisodeKey(`${firstPlayable.season_number}:${firstPlayable.ep_number}`);
                    setSelectedSeason(String(firstPlayable.season_number));
                }
            }
            if (user) {
                try {
                    const p = await api.get("/watch-progress");
                    const item = p.data.find((x) => x.id === id);
                    if (item && item.position_seconds > 5) setResumeAt(item.position_seconds);
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
                        {media.type !== "movie" && episodes.length > 0 && (
                            <div className="mb-5 rounded-2xl border border-[#262626] bg-[#0a0a0a] p-4 sm:p-5">
                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-[#E8D2A6]">Saisons et épisodes</div>
                                        <div className="mt-1 text-xs text-neutral-500">
                                            {selectedEpisode
                                                ? `Saison ${selectedEpisode.season_number} · Épisode ${selectedEpisode.ep_number}`
                                                : "Choisissez un épisode"}
                                        </div>
                                    </div>
                                    <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                                        {(media.seasons || []).map((season) => {
                                            const seasonNumber = String(season.season_number);
                                            const isActive = selectedSeasonNumber === seasonNumber;
                                            return (
                                                <button
                                                    key={seasonNumber}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSeason(seasonNumber);
                                                        const firstEpisode = episodes.find(
                                                            (episode) => String(episode.season_number) === seasonNumber
                                                                && (episode.bunny_video_id || episode.video_url || episode.video_file_path)
                                                        ) || episodes.find(
                                                            (episode) => String(episode.season_number) === seasonNumber
                                                        );
                                                        if (firstEpisode) selectEpisode(firstEpisode);
                                                    }}
                                                    className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${isActive
                                                        ? "border-[#E8D2A6] bg-[#E8D2A6] text-black"
                                                        : "border-[#333] text-neutral-300 hover:border-[#E8D2A6]/60 hover:text-white"}`}
                                                >
                                                    Saison {season.season_number}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="max-h-64 space-y-2 overflow-y-auto pr-2 [scrollbar-color:#E8D2A6_#171717] [scrollbar-width:thin]">
                                    {seasonEpisodes.map((episode) => {
                                        const playable = !!(episode.bunny_video_id || episode.video_url || episode.video_file_path);
                                        const isActive = selectedEpisode?._key === episode._key;
                                        return (
                                            <button
                                                key={episode._key}
                                                type="button"
                                                disabled={!playable}
                                                onClick={() => selectEpisode(episode)}
                                                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${isActive
                                                    ? "border-[#E8D2A6] bg-[#E8D2A6]/10 text-white"
                                                    : playable
                                                        ? "border-[#242424] bg-[#101010] text-neutral-300 hover:border-[#E8D2A6]/50 hover:bg-[#141414]"
                                                        : "cursor-not-allowed border-[#1d1d1d] bg-[#0c0c0c] text-neutral-600"}`}
                                                title={playable ? episode.title : "Aucun fichier vidéo pour cet épisode"}
                                            >
                                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isActive
                                                    ? "bg-[#E8D2A6] text-black"
                                                    : "bg-[#1d1d1d] text-neutral-400"}`}>
                                                    {episode.ep_number}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block text-xs uppercase tracking-[0.14em] text-neutral-500">
                                                        Épisode {episode.ep_number}
                                                    </span>
                                                    <span className="mt-0.5 block truncate text-sm">
                                                        {episode.title || `Épisode ${episode.ep_number}`}
                                                    </span>
                                                </span>
                                                {isActive && <Play size={15} className="ml-auto shrink-0 text-[#E8D2A6]" fill="currentColor" />}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#202020] pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={!previousEpisode}
                                        onClick={() => selectEpisode(previousEpisode)}
                                        className="h-11 rounded-full border-[#333] bg-transparent text-white hover:border-[#E8D2A6]/60 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                        <ChevronLeft size={16} className="mr-2" />
                                        Précédent
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={!nextEpisode}
                                        onClick={() => selectEpisode(nextEpisode)}
                                        className="h-11 rounded-full border-[#333] bg-transparent text-white hover:border-[#E8D2A6]/60 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                        Suivant
                                        <ChevronRight size={16} className="ml-2" />
                                    </Button>
                                </div>
                            </div>
                        )}
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
