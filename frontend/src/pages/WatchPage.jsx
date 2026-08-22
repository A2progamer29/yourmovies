import React, { useEffect, useState, useCallback, useRef } from "react";
import Chargement from "@/components/Chargement";
import { lireLocal } from "@/lib/stockage";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ChevronDown, Users, Play, Film, ListVideo, X, Clock3, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOfflineDownloads } from "@/context/OfflineDownloadsContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import OfflineDownloadButton from "@/components/OfflineDownloadButton";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import ReportDialog from "@/components/ReportDialog";
import TurnstileGate from "@/components/TurnstileGate";
import PlayerGestures from "@/components/PlayerGestures";
import AvertissementContenu from "@/components/AvertissementContenu";
import { lirePass } from "@/lib/playbackPass";
import VideoPlayer from "@/components/VideoPlayer";
import WatchParty from "@/components/WatchParty";
import PreRollAd from "@/components/PreRollAd";
import AdGate from "@/components/AdGate";
import SuiteAutomatique from "@/components/SuiteAutomatique";

const BUNNY_LIBRARY_ID = process.env.REACT_APP_BUNNY_LIBRARY_ID || "719915";
const BUNNY_PLAYER_API_URL = "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js";
const PROGRESS_SAVE_INTERVAL_MS = 10_000;
const SEUIL_FIN = 0.95;
let bunnyPlayerApiPromise;

function loadBunnyPlayerApi() {
    if (typeof window === "undefined") return Promise.reject(new Error("Player unavailable"));
    if (window.playerjs?.Player) return Promise.resolve(window.playerjs);
    if (bunnyPlayerApiPromise) return bunnyPlayerApiPromise;

    bunnyPlayerApiPromise = new Promise((resolve, reject) => {
        const finish = () => window.playerjs?.Player
            ? resolve(window.playerjs)
            : reject(new Error("Player API unavailable"));
        const existing = document.querySelector(`script[src="${BUNNY_PLAYER_API_URL}"]`);
        if (existing) {
            existing.addEventListener("load", finish, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = BUNNY_PLAYER_API_URL;
        script.async = true;
        script.addEventListener("load", finish, { once: true });
        script.addEventListener("error", reject, { once: true });
        document.head.appendChild(script);
    });
    return bunnyPlayerApiPromise;
}


function resolveBunnySource(media) {
    if (!media) return null;
    // Une piste importee seule fait office de video principale : sinon un episode
    // n'existant qu'en VO passerait pour depourvu de fichier.
    const premierePiste = (media.language_tracks || []).find((p) => p?.bunny_video_id);
    const candidates = [media.bunny_video_id, media.video_url, premierePiste?.bunny_video_id]
        .filter(Boolean);

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
            // A raw GUID is the preferred stored format.
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

/** Un fichier est jouable par sa piste principale ou par l'une de ses pistes de
 *  langue. Ce test doit rester unique : reparti en plusieurs endroits, il en
 *  restait toujours un qui ignorait les pistes et rejetait l'episode. */
function estJouable(item) {
    if (!item) return false;
    return Boolean(
        item.bunny_video_id
        || item.video_url
        || item.video_file_path
        || (item.language_tracks || []).some((piste) => piste?.bunny_video_id),
    );
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
    locked,
}) {
    return (
        <>
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
                            className="relative z-10 max-h-[94%] w-full overflow-y-auto no-scrollbar border-t border-[#262626] bg-[#0a0a0a]/[0.98] px-4 pb-4 pt-4 shadow-[0_-18px_55px_rgba(0,0,0,0.65)] sm:px-6 sm:pb-6 sm:pt-5"
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
                                        disabled={!previousEpisode || locked}
                                        onClick={() => previousEpisode && onEpisodeSelect(previousEpisode)}
                                        aria-label="Épisode précédent"
                                        title="Épisode précédent"
                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#333] bg-black/30 text-white transition-colors hover:border-[#E8D2A6]/60 hover:text-[#E8D2A6] disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        <ChevronLeft size={17} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!nextEpisode || locked}
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

                            <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                {(seasons || []).map((season) => {
                                    const seasonNumber = String(season.season_number);
                                    const isActive = selectedSeasonNumber === seasonNumber;
                                    return (
                                        <button
                                            key={seasonNumber}
                                            type="button"
                                            onClick={() => onSeasonChange(seasonNumber)}
                                            className={"shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] " + (
                                                isActive
                                                    ? "border-[#E8D2A6] bg-[#E8D2A6] text-black"
                                                    : "border-[#262626] bg-[#0a0a0a] text-neutral-300 hover:border-[#E8D2A6]/60 hover:text-white"
                                            )}
                                        >
                                            Saison {season.season_number}
                                        </button>
                                    );
                                })}
                            </div>

                            <ul className="mt-4 max-h-[38vh] divide-y divide-[#1a1a1a] overflow-y-auto border-t border-[#1a1a1a] pr-1 [scrollbar-color:#3a3a3a_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:bg-transparent">
                                {seasonEpisodes.map((episode) => {
                                    const playable = estJouable(episode);
                                    const isActive = selectedEpisode?._key === episode._key;
                                    const duration = formatEpisodeDuration(episode);
                                    const progress = getEpisodeProgress(episode, watchProgress);
                                    const label = episode.title || "Épisode " + episode.ep_number;

                                    return (
                                        <li key={episode._key}>
                                            <button
                                                type="button"
                                                disabled={!playable}
                                                onClick={() => onEpisodeSelect(episode)}
                                                title={playable ? label : "Aucun fichier vidéo pour cet épisode"}
                                                className={"group flex w-full items-center gap-3.5 border-l-2 px-3 py-3.5 text-left transition-[border-color,padding] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] " + (
                                                    isActive
                                                        ? "border-[#E8D2A6] pl-5"
                                                        : playable
                                                            ? "border-transparent hover:border-[#E8D2A6] hover:pl-5"
                                                            : "cursor-not-allowed border-transparent opacity-45"
                                                )}
                                            >
                                                <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors " + (
                                                    isActive
                                                        ? "border-[#E8D2A6] bg-[#E8D2A6] text-black"
                                                        : "border-[#262626] text-neutral-400 group-hover:border-[#E8D2A6] group-hover:bg-[#E8D2A6] group-hover:text-black"
                                                )}>
                                                    {isActive ? <Play size={13} fill="currentColor" /> : episode.ep_number}
                                                </span>

                                                <span className="min-w-0 flex-1">
                                                    <span className={"block truncate text-sm transition-colors " + (isActive ? "text-[#E8D2A6]" : "text-white group-hover:text-[#E8D2A6]")}>
                                                        <span className="mr-2.5 text-neutral-500">E{episode.ep_number}</span>
                                                        {label}
                                                    </span>
                                                    <span className="mt-1 flex items-center gap-2.5 text-[11px] text-neutral-500">
                                                        {duration && <span className="flex items-center gap-1"><Clock3 size={11} />{duration}</span>}
                                                        {progress > 0 && progress < 95 && <span className="text-[#E8D2A6]">À reprendre</span>}
                                                        {progress >= 95 && <span className="text-neutral-400">Terminé</span>}
                                                        {!playable && <span>Bientôt</span>}
                                                    </span>
                                                    {isActive && progress > 0 && (
                                                        <span className="mt-2 block h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                                                            <span className="block h-full bg-[#E8D2A6]" style={{ width: progress + "%" }} />
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
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
    const { user, loading: authEnCours, activeProfile } = useAuth();
    const { downloads, eligible: offlineEligible } = useOfflineDownloads();
    const [searchParams, setSearchParams] = useSearchParams();
    const [media, setMedia] = useState(null);
    const [selectedEpisodeKey, setSelectedEpisodeKey] = useState("");
    const [selectedSeason, setSelectedSeason] = useState("");
    const [resumeAt, setResumeAt] = useState(0);
    const [watchProgress, setWatchProgress] = useState(null);
    const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
    const [isPartyHost, setIsPartyHost] = useState(false);
    const [partyStarted, setPartyStarted] = useState(false);
    const [partyCode, setPartyCode] = useState(searchParams.get("party") || "");
    const [joinInput, setJoinInput] = useState("");
    const [partyOpen, setPartyOpen] = useState(Boolean(searchParams.get("party")));
    const videoElRef = useRef(null);
    const bunnyIframeRef = useRef(null);
    const bunnyPlayerRef = useRef(null);
    const bunnyLastProgressSave = useRef(0);
    const [bunnyPlaybackUrl, setBunnyPlaybackUrl] = useState(null);
    const [manifestUrl, setManifestUrl] = useState(null);
    const [piste, setPiste] = useState(() => searchParams.get("piste") || null);
    // Seul le franchissement du seuil change de lecteur. Faire dépendre l'appel
    // de la valeur elle-même relancerait la vidéo à chaque cran du curseur.
    const lecteurAvanceDemande = (Number(user?.audio_boost) || 1) > 1;
    const [bunnyPlaybackError, setBunnyPlaybackError] = useState(null);
    // En salon, la fin des publicités change la mise en page et reconstruit
    // l'iframe du lecteur : on recharge la page pour repartir sur un lecteur propre.
    // L'état est donc mémorisé le temps de la session, sinon le rechargement
    // rejouerait les publicités et bouclerait indéfiniment.
    const adsMemoryKey = searchParams.get("party") ? `ym_party_ads:${searchParams.get("party")}:${id}` : null;
    const readAdsMemory = () => {
        if (!adsMemoryKey) return false;
        try { return sessionStorage.getItem(adsMemoryKey) === "1"; } catch { return false; }
    };
    const adsAlreadyCleared = useRef(readAdsMemory());
    const [adDone, setAdDone] = useState(adsAlreadyCleared.current);
    const [gateDone, setGateDone] = useState(adsAlreadyCleared.current);
    const [verifie, setVerifie] = useState(() => Boolean(lirePass()));
    const [playbackActive, setPlaybackActive] = useState(false);
    const [chronologie, setChronologie] = useState({ titre: "", items: [] });
    const saveProgressRef = useRef(() => { });
    const [finAtteinte, setFinAtteinte] = useState(false);
    const suiteRefusee = useRef(false);
    const episodes = React.useMemo(() => (media?.seasons || []).flatMap((season) =>
        (season.episodes || []).map((episode) => ({
            ...episode,
            season_number: season.season_number,
            _key: `${season.season_number}:${episode.ep_number}`,
        }))
    ), [media]);
    const selectedEpisode = episodes.find((episode) => episode._key === selectedEpisodeKey)
        || episodes.find(estJouable)
        || episodes[0]
        || null;
    const selectedSeasonNumber = selectedSeason
        || String(selectedEpisode?.season_number ?? media?.seasons?.[0]?.season_number ?? "");
    const seasonEpisodes = episodes.filter(
        (episode) => String(episode.season_number) === selectedSeasonNumber
    );
    const playableEpisodes = episodes.filter(estJouable);
    const selectedPlayableIndex = playableEpisodes.findIndex(
        (episode) => episode._key === selectedEpisode?._key
    );
    const previousEpisode = selectedPlayableIndex > 0
        ? playableEpisodes[selectedPlayableIndex - 1]
        : null;
    const nextEpisode = selectedPlayableIndex >= 0 && selectedPlayableIndex < playableEpisodes.length - 1
        ? playableEpisodes[selectedPlayableIndex + 1]
        : null;

    useEffect(() => {
        if (navigator.onLine || !offlineEligible || !downloads.length) return;
        const season = searchParams.get("season");
        const episode = searchParams.get("episode");
        const saved = downloads.find((item) => item.media_id === id
            && (!season || String(item.season_number) === String(season))
            && (!episode || String(item.episode_number) === String(episode)));
        if (saved) navigate(`/offline/${encodeURIComponent(saved.id)}`, { replace: true });
    }, [downloads, id, navigate, offlineEligible, searchParams]);

    useEffect(() => {
        setPlaybackActive(false);
        setPiste(searchParams.get("piste") || null);
        setFinAtteinte(false);
        suiteRefusee.current = false;
    }, [id, selectedEpisodeKey]);

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
    // La suite d'un film se trouve dans sa chronologie : on ne la charge donc que
    // pour un film, et seulement si la lecture automatique est active.
    useEffect(() => {
        if (!media || media.type !== "movie" || user?.autoplay_next === false) {
            setChronologie({ titre: "", items: [] });
            return undefined;
        }
        let actif = true;
        api.get(`/media/${id}/timeline`, { silent: true })
            .then((r) => {
                if (actif) setChronologie({ titre: r.data?.title || "", items: r.data?.items || [] });
            })
            .catch(() => { if (actif) setChronologie({ titre: "", items: [] }); });
        return () => { actif = false; };
    }, [id, media, user?.autoplay_next]);

    // Ce qui sera lu ensuite : l'épisode suivant pour une série ou un animé, le
    // titre suivant de la saga pour un film. Un maillon absent du catalogue est
    // enjambé — proposer une fiche introuvable ne mènerait nulle part.
    const suiteDisponible = React.useMemo(() => {
        if (media?.type !== "movie") {
            if (!nextEpisode) return null;
            return {
                cle: `episode:${nextEpisode._key}`,
                genre: "episode",
                titre: nextEpisode.title || `Épisode ${nextEpisode.ep_number}`,
                detail: `Saison ${nextEpisode.season_number} · Épisode ${nextEpisode.ep_number}`,
                poster: media?.poster_url,
                episode: nextEpisode,
            };
        }
        const position = chronologie.items.findIndex((item) => item.current);
        if (position < 0) return null;
        const suivant = chronologie.items
            .slice(position + 1)
            .find((item) => item.available && item.media_id);
        if (!suivant) return null;
        return {
            cle: `film:${suivant.media_id}`,
            genre: "film",
            titre: suivant.title,
            detail: [chronologie.titre, suivant.year].filter(Boolean).join(" · "),
            poster: suivant.poster_url,
            mediaId: suivant.media_id,
        };
    }, [media?.type, media?.poster_url, nextEpisode, chronologie]);

    // Appelé à chaque remontée de position, sans passer par la limitation
    // d'écriture de la progression : le seuil doit être vu dès qu'il est franchi.
    const signalerAvancement = useCallback((position, duree) => {
        if (suiteRefusee.current) return;
        const p = Number(position);
        const d = Number(duree);
        if (!Number.isFinite(p) || !Number.isFinite(d) || d <= 0) return;
        if (p / d >= SEUIL_FIN) setFinAtteinte(true);
    }, []);

    const suivreProgression = useCallback((position, duree) => {
        saveProgressRef.current(position, duree);
        signalerAvancement(position, duree);
    }, [signalerAvancement]);

    const lancerSuite = () => {
        if (!suiteDisponible) return;
        setFinAtteinte(false);
        if (suiteDisponible.genre === "episode") {
            selectEpisode(suiteDisponible.episode);
            return;
        }
        navigate(`/watch/${suiteDisponible.mediaId}`);
    };

    // Un refus vaut pour tout le reste du titre : sans cela la carte
    // reparaîtrait à la remontée de position suivante, toujours au-delà du seuil.
    const refuserSuite = () => {
        suiteRefusee.current = true;
        setFinAtteinte(false);
    };

    // En salon, seul l'hôte fait avancer la séance : proposer la suite à un
    // invité le sortirait de la vidéo commune.
    const afficherSuite = finAtteinte
        && user?.autoplay_next !== false
        && Boolean(suiteDisponible)
        && !(partyOpen && !isPartyHost);

    // Le flux direct peut être refusé une fois dans le navigateur ; on repasse
    // alors définitivement sur le lecteur intégré pour ce titre.
    const revenirAuLecteurIntegre = useCallback(() => setManifestUrl(null), []);

    // Ce que le lecteur affiche à l'arrêt : pour une série, l'épisode en cours
    // prime sur la fiche du titre, sinon on annoncerait le mauvais résumé.
    const ficheLecteur = React.useMemo(() => {
        if (!media) return null;
        const episode = media.type === "movie" ? null : selectedEpisode;
        return {
            titre: media.title,
            affiche: media.poster_url,
            sousTitre: episode
                ? `Saison ${episode.season_number} · Épisode ${episode.ep_number}${episode.title ? ` — ${episode.title}` : ""}`
                : [media.year, media.duration_minutes ? `${media.duration_minutes} min` : null].filter(Boolean).join(" · "),
            description: episode?.description || media.description,
        };
    }, [media, selectedEpisode]);

    const baseMedia = media?.type === "movie" ? media : selectedEpisode;
    // Une piste choisie remplace la source principale : le lecteur doit
    // vraiment changer de fichier, pas seulement l'affichage du bouton.
    const pisteActive = piste ? (baseMedia?.language_tracks || []).find((p) => p?.label === piste) : null;
    const playbackMedia = pisteActive
        ? { ...baseMedia, bunny_video_id: pisteActive.bunny_video_id, bunny_library_id: pisteActive.bunny_library_id }
        : baseMedia;
    // Sortie de plein écran : certains navigateurs laissent le document en
    // plein écran alors que le lecteur en est sorti. On referme explicitement.
    useEffect(() => {
        const auChangement = () => {
            const actif = document.fullscreenElement || document.webkitFullscreenElement;
            if (actif) return;
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => { });
            }
        };
        document.addEventListener("fullscreenchange", auChangement);
        document.addEventListener("webkitfullscreenchange", auChangement);
        return () => {
            document.removeEventListener("fullscreenchange", auChangement);
            document.removeEventListener("webkitfullscreenchange", auChangement);
        };
    }, []);

    const bunnySource = resolveBunnySource(playbackMedia);

    // Déclaré après bunnySource, dont il dépend.
    const lecteurDirectActif = Boolean(bunnySource && manifestUrl && !partyOpen);

    // Les pistes appartiennent au fichier joue : celles de l'episode en cours pour
    // une serie, celles de la fiche pour un film.
    const pistesDisponibles = ((media?.type === "movie" ? media : selectedEpisode)?.language_tracks || [])
        .filter((p) => p && p.label && p.bunny_video_id);

    useEffect(() => {
        // Sans la preuve de vérification, le serveur refuserait l'URL : on
        // n'appelle donc pas tant qu'elle n'a pas été franchie.
        if (!bunnySource?.videoId || !verifie) {
            setBunnyPlaybackUrl(null);
            return;
        }
        let active = true;
        setBunnyPlaybackUrl(null);
        setManifestUrl(null);
        setBunnyPlaybackError(null);
        // Le lecteur avancé n'est demandé que si l'amplification est réglée : sans
        // elle il n'apporte rien, et le lecteur intégré reste le chemin éprouvé.
        const amplification = lecteurAvanceDemande ? 2 : 1;
        const playbackParams = {
            ...(media?.type === "movie" ? {} : {
                season_number: selectedEpisode?.season_number,
                episode_number: selectedEpisode?.ep_number,
            }),
            ...(amplification > 1 ? { direct: 1 } : {}),
            ...(piste ? { track: piste } : {}),
        };
        api.get(`/bunny/playback/${id}`, {
            params: playbackParams,
            silent: true,
            headers: lirePass() ? { "X-Playback-Pass": lirePass() } : undefined,
        })
            .then((response) => {
                if (!active) return;
                const data = response.data || {};
                if (!data.url) {
                    setBunnyPlaybackError("Le backend n’a renvoyé aucune URL de lecture.");
                    return;
                }
                // Le flux servi en direct autorise nos propres contrôles, dont
                // l’amplification du son. À défaut, le lecteur intégré prend le relais.
                setManifestUrl(data.playback_type === "direct" ? data.manifest_url : null);
                if (data.libraryMatchesUploadConfig === false) {
                    setBunnyPlaybackError(
                        `Cette vidéo appartient à la bibliothèque ${data.libraryId}, mais le serveur est configuré pour une autre. Corrige la configuration ou réimporte la vidéo.`
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
                    detail || `Impossible d’obtenir l’autorisation de lecture${status ? ` (HTTP ${status})` : ""}. Vérifie la configuration du serveur et la sécurité de la bibliothèque.`
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
        verifie,
        piste,
        // Changer de lecteur, oui ; changer de niveau, non : le niveau est suivi
        // en direct par le lecteur lui-même.
        lecteurAvanceDemande,
    ]);

    useEffect(() => {
        (async () => {
            if (!navigator.onLine) return;
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
                    && estJouable(episode)
                );
                const firstPlayable = requested || allEpisodes.find(estJouable);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, user]);

    const saveProgress = useCallback(async (pos, dur) => {
        if (!user) return;
        if (pos < 3) return;
        setPlaybackActive(true);
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

    useEffect(() => { saveProgressRef.current = saveProgress; }, [saveProgress]);

    useEffect(() => {
        const iframe = bunnyIframeRef.current;
        if (!user || !bunnyPlaybackUrl || !iframe) return undefined;

        let disposed = false;
        let player = null;
        let knownDuration = 0;
        const listeners = [];
        bunnyLastProgressSave.current = 0;

        const on = (eventName, handler) => {
            player.on(eventName, handler);
            listeners.push([eventName, handler]);
        };

        const persistProgress = (positionValue, durationValue, force = false) => {
            const position = Number(positionValue);
            const duration = Number(durationValue || knownDuration);
            if (!Number.isFinite(position) || position < 3) return;
            if (Number.isFinite(duration) && duration > 0) knownDuration = duration;

            signalerAvancement(position, knownDuration);

            const completed = knownDuration > 0 && position / knownDuration >= SEUIL_FIN;
            const now = Date.now();
            if (!force && !completed && now - bunnyLastProgressSave.current < PROGRESS_SAVE_INTERVAL_MS) return;
            bunnyLastProgressSave.current = now;
            saveProgress(position, knownDuration || null);
        };

        // Repli : si l'API du lecteur est indisponible (script tiers bloqué par une
        // extension, réseau filtré…), on estime la progression au temps écoulé
        // pendant que l'onglet est visible. Moins précis, mais évite de perdre
        // totalement la reprise de lecture.
        let fallbackTimer = null;
        const startFallbackTracking = () => {
            if (disposed || fallbackTimer) return;
            const startedAt = Date.now();
            const base = Number(resumeAt) || 0;
            const mediaMinutes = media?.type === "movie"
                ? media?.duration_minutes
                : (selectedEpisode?.duration_minutes ?? selectedEpisode?.duration);
            const estimatedDuration = Number(mediaMinutes) > 0 ? Number(mediaMinutes) * 60 : 0;
            fallbackTimer = window.setInterval(() => {
                if (disposed || document.visibilityState !== "visible") return;
                const position = base + (Date.now() - startedAt) / 1000;
                if (estimatedDuration > 0 && position > estimatedDuration) return;
                saveProgress(position, estimatedDuration || null);
                signalerAvancement(position, estimatedDuration);
            }, PROGRESS_SAVE_INTERVAL_MS);
        };

        loadBunnyPlayerApi()
            .then((playerjs) => {
                if (disposed || !bunnyIframeRef.current) return;
                player = new playerjs.Player(bunnyIframeRef.current);
                bunnyPlayerRef.current = player;
                on("ready", () => {
                    player.getDuration((duration) => {
                        const parsed = Number(duration);
                        if (Number.isFinite(parsed) && parsed > 0) knownDuration = parsed;
                    });
                });
                on("timeupdate", (data) => {
                    const position = data?.seconds ?? data?.currentTime ?? data?.position ?? data;
                    const duration = data?.duration ?? data?.total ?? knownDuration;
                    persistProgress(position, duration);
                });
                on("ended", () => {
                    if (knownDuration > 0) persistProgress(knownDuration, knownDuration, true);
                    if (!suiteRefusee.current) setFinAtteinte(true);
                });
                // L'API répond mais n'émet aucun « timeupdate » : on bascule aussi.
                window.setTimeout(() => {
                    if (!disposed && bunnyLastProgressSave.current === 0) startFallbackTracking();
                }, 45_000);
            })
            .catch(() => {
                // La lecture reste disponible même si l'API de suivi est
                // indisponible : on bascule sur l'estimation par temps écoulé.
                startFallbackTracking();
            });

        return () => {
            disposed = true;
            bunnyPlayerRef.current = null;
            if (fallbackTimer) window.clearInterval(fallbackTimer);
            // L'iframe peut déjà avoir quitté le DOM (porte pub, changement d'épisode) :
            // player.off() ferait alors un postMessage sur un contentWindow null.
            if (player?.off) {
                listeners.forEach(([eventName, handler]) => {
                    try { player.off(eventName, handler); } catch { }
                });
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, bunnyPlaybackUrl, saveProgress, resumeAt]);

    const markEmbeddedPlaybackStarted = useCallback(async () => {
        if (!user || !media) return;
        setPlaybackActive(true);
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

    useEffect(() => {
        if (!playbackActive || !user || !media) return undefined;

        const heartbeat = async () => {
            if (document.visibilityState !== "visible") return;
            const rawDuration = media.type === "movie"
                ? media.duration_minutes
                : (selectedEpisode?.duration_minutes ?? selectedEpisode?.duration ?? media.duration_minutes);
            const durationMinutes = Number.parseFloat(rawDuration);
            try {
                await api.post("/watch-progress/activity", {
                    media_id: id,
                    duration_seconds: Number.isFinite(durationMinutes) && durationMinutes > 0
                        ? durationMinutes * 60
                        : null,
                    season_number: media.type === "movie" ? null : selectedEpisode?.season_number,
                    episode_number: media.type === "movie" ? null : selectedEpisode?.ep_number,
                }, { silent: true });
            } catch (e) { }
        };

        heartbeat();
        const interval = window.setInterval(heartbeat, 45_000);
        document.addEventListener("visibilitychange", heartbeat);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", heartbeat);
        };
    }, [
        id,
        user,
        media,
        playbackActive,
        selectedEpisode?.duration,
        selectedEpisode?.duration_minutes,
        selectedEpisode?.season_number,
        selectedEpisode?.ep_number,
    ]);

    useEffect(() => {
        if (!adsMemoryKey || adsAlreadyCleared.current) return;
        if (!user || user.premium) return;
        if (!gateDone || !adDone) return;
        try { sessionStorage.setItem(adsMemoryKey, "1"); } catch { }
        window.location.reload();
    }, [adsMemoryKey, gateDone, adDone, user]);

    // Entrer dans un salon recharge la page : le lecteur est reconstruit
    // par le changement de mise en page, et l'ancienne instance restait
    // attachée — d'où la synchronisation qui n'arrivait qu'après un F5 manuel.
    const gotoParty = (code) => {
        const next = new URLSearchParams(searchParams);
        if (code) next.set("party", code); else next.delete("party");
        const query = next.toString();
        window.location.href = window.location.pathname + (query ? `?${query}` : "");
    };

    const createParty = async () => {
        if (!user) { navigate("/login"); return; }
        try {
            const r = await api.post("/party/create", { media_id: id });
            gotoParty(r.data.code);
        } catch (e) { showError(toast, e, "Impossible de créer le salon"); }
    };

    const joinParty = async (rawCode) => {
        if (!user) { navigate("/login"); return; }
        const source = typeof rawCode === "string" ? rawCode : joinInput;
        if (!source.trim()) return;
        const code = source.trim().toUpperCase();
        // Sans cette vérification, un code inexistant ouvrait un salon vide.
        try {
            await api.get(`/party/${code}`);
        } catch (e) {
            if (e?.response?.status === 404) {
                toast.error(`Aucun salon ne porte le code ${code}.`);
                setJoinInput("");
                return;
            }
            showError(toast, e, "Impossible de rejoindre le salon");
            return;
        }
        gotoParty(code);
    };

    const closeParty = () => { gotoParty(null); };

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
                <div className="max-w-7xl mx-auto px-6"><Chargement pleinePage /></div>
            </div>
        );
    }

    const qualities = fallbackQualities(playbackMedia);
    const userMaxQuality = "4k";
    // Sans attendre la fin du chargement, un membre premium verrait la porte
    // publicitaire pendant la seconde qui précède l'arrivée de son compte.
    const runAds = !authEnCours && !user?.premium;
    const hasVideo = !!(bunnySource || qualities.length > 0);
    const showGate = runAds && !gateDone && hasVideo;
    const showAd = runAds && gateDone && !adDone && hasVideo;
    const adsDone = !runAds || adDone;
    const token = lireLocal("ym_token");

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
                    {/* Le titre passe dans le lecteur, où il s'affiche à l'arrêt avec
                        l'affiche et le résumé. Il reste ici quand le lecteur intégré
                        prend le relais, faute de pouvoir y incruster quoi que ce soit. */}
                    <h1 className={`font-display text-3xl sm:text-4xl ${lecteurDirectActif ? "sr-only" : ""}`}>
                        {media.title}
                    </h1>
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
                                {/* Code à 6 caractères : dès qu'il est complet, on entre dans
                                    le salon. Évite un bouton « Rejoindre » hors écran sur mobile. */}
                                <div className="relative w-full sm:w-48">
                                    <Input
                                        data-testid="party-join-input"
                                        value={joinInput}
                                        onChange={(e) => {
                                            const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
                                            setJoinInput(value);
                                            if (value.length === 6) joinParty(value);
                                        }}
                                        onKeyDown={(e) => { if (e.key === "Enter") joinParty(); }}
                                        placeholder="Code du salon"
                                        inputMode="text"
                                        autoComplete="off"
                                        maxLength={6}
                                        className="h-10 w-full bg-[#111] border-[#262626] pr-16 text-white tracking-[0.3em] uppercase placeholder:tracking-normal"
                                    />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-neutral-500">
                                        {joinInput.length}/6
                                    </span>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
                    <div>
                        <div className="relative overflow-hidden rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            {media.player_broken ? (
                            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }} data-testid="player-broken">
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0a0a0a] to-[#050505] px-6 text-center">
                                    <TriangleAlert size={24} className="text-amber-400" />
                                    <div className="font-display text-2xl text-white">Lecture indisponible</div>
                                    <p className="max-w-md text-sm leading-relaxed text-neutral-400">
                                        {media.player_notice || "Le lecteur de ce contenu est momentanément indisponible. Nous travaillons à le rétablir."}
                                    </p>
                                </div>
                            </div>
                        ) : showGate ? (
                            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
                                <AdGate onUnlock={() => setGateDone(true)} />
                            </div>
                        ) : showAd ? (
                            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
                                <PreRollAd onDone={() => setAdDone(true)} />
                            </div>
                        ) : !verifie ? (
                            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
                                <TurnstileGate onVerified={() => setVerifie(true)} />
                            </div>
                        ) : bunnySource && manifestUrl && !partyOpen ? (
                            /* En salon, le lecteur intégré reste seul : c'est lui que le
                               masque de l'invité neutralise pour laisser l'hôte diriger. */
                            <VideoPlayer
                                key={manifestUrl}
                                manifestUrl={manifestUrl}
                                poster={media.banner_url || media.poster_url}
                                onProgress={suivreProgression}
                                startAt={resumeAt}
                                userMaxQuality={userMaxQuality}
                                runAds={false}
                                videoRefOut={videoElRef}
                                onFluxImpossible={revenirAuLecteurIntegre}
                                fiche={ficheLecteur}
                                boostInitial={Number(user?.audio_boost) || 1}
                            />
                        ) : bunnySource ? (
                            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
                                {bunnyPlaybackError ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-[#050505] p-6">
                                        <div className="max-w-xl text-center">
                                            <div className="font-display text-2xl text-white">Lecture indisponible</div>
                                            <p className="mt-3 text-sm leading-relaxed text-neutral-400">La vidéo ne peut pas être lancée pour le moment. Réessaie dans quelques instants.</p>
                                        </div>
                                    </div>
                                ) : bunnyPlaybackUrl ? (
                                    <iframe
                                        ref={bunnyIframeRef}
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
                                <PlayerGestures
                                    playerRef={bunnyPlayerRef}
                                    disabled={partyOpen && !isPartyHost}
                                />

                                {partyOpen && partyStarted && !isPartyHost && (
                                    <div className="pointer-events-none absolute inset-0 z-30" data-testid="party-guest-shield">
                                        {/* Le lecteur est sur un autre domaine : impossible de
                                            désactiver certains de ses boutons. On masque donc la zone
                                            de lecture et la barre de progression, en laissant libre le
                                            coin des réglages et du plein écran. */}
                                        <div className="pointer-events-auto absolute inset-x-0 top-0 bottom-[52px]" />
                                        <div className="pointer-events-auto absolute bottom-0 left-0 right-[150px] h-[52px]" />
                                        <div className="absolute inset-x-0 top-0 flex justify-center">
                                            <span className="mt-3 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur">
                                                Lecture contrôlée par l&apos;hôte
                                            </span>
                                        </div>
                                    </div>
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
                                onProgress={suivreProgression}
                                startAt={resumeAt}
                                userMaxQuality={userMaxQuality}
                                runAds={false}
                                videoRefOut={videoElRef}
                            />
                            )}

                            {pistesDisponibles.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 border-t border-[#1a1a1a] px-4 py-3" data-testid="choix-piste">
                                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">Version</span>
                                    <button
                                        type="button"
                                        onClick={() => setPiste(null)}
                                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${piste === null
                                            ? "bg-[#E8D2A6] text-black"
                                            : "bg-[#161616] text-neutral-300 hover:bg-[#1f1f1f]"}`}
                                    >
                                        Principale
                                    </button>
                                    {pistesDisponibles.map((p) => (
                                        <button
                                            key={p.label}
                                            type="button"
                                            onClick={() => setPiste(p.label)}
                                            data-testid={`piste-${p.label}`}
                                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${piste === p.label
                                                ? "bg-[#E8D2A6] text-black"
                                                : "bg-[#161616] text-neutral-300 hover:bg-[#1f1f1f]"}`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {afficherSuite && (
                                <SuiteAutomatique
                                    suite={suiteDisponible}
                                    onLancer={lancerSuite}
                                    onAnnuler={refuserSuite}
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
                                    locked={partyOpen && !isPartyHost}
                                />
                            )}

                        {partyOpen && !partyStarted && !showGate && !showAd && (
                            <div className="absolute inset-x-0 top-0 bottom-[60px] z-40 flex flex-col items-center justify-center gap-2 bg-black/85 px-6 text-center backdrop-blur-sm" data-testid="party-waiting">
                                <Users size={22} className="text-[#E8D2A6]" />
                                <div className="font-display text-lg text-white">
                                    {isPartyHost ? "Prêt à lancer la séance" : "En attente de l'hôte"}
                                </div>
                                <p className="max-w-sm text-xs leading-relaxed text-neutral-400">
                                    {isPartyHost
                                        ? "La lecture démarrera pour tout le monde en même temps, une fois les publicités de chacun terminées."
                                        : "La lecture démarrera automatiquement dès que l'hôte lancera la séance."}
                                </p>
                            </div>
                        )}

                        {media.type !== "movie" && episodes.length > 0 && (
                            <div className="flex items-center gap-2 border-t border-[#262626] bg-[#0a0a0a] px-2.5 py-2.5 sm:gap-3 sm:px-3" data-testid="episode-nav">
                                <Button
                                    variant="outline"
                                    onClick={() => previousEpisode && selectEpisode(previousEpisode)}
                                    disabled={!previousEpisode}
                                    data-testid="episode-prev"
                                    title={previousEpisode ? `S${previousEpisode.season_number}E${previousEpisode.ep_number} — ${previousEpisode.title || "Sans titre"}` : "Aucun épisode précédent"}
                                    className="h-11 shrink-0 rounded-full border-[#262626] bg-transparent px-4 text-white transition-colors hover:border-[#E8D2A6]/60 hover:bg-white/5 disabled:opacity-30"
                                >
                                    <ChevronLeft size={16} className="sm:mr-1.5" />
                                    <span className="hidden sm:inline">Précédent</span>
                                </Button>

                                <button
                                    type="button"
                                    disabled={partyOpen && !isPartyHost}
                                    onClick={() => setEpisodePanelOpen((v) => !v)}
                                    aria-expanded={episodePanelOpen}
                                    aria-controls="episode-selector-panel"
                                    data-testid="episode-picker"
                                    className={`group flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border px-4 text-left transition-colors ${episodePanelOpen ? "border-[#E8D2A6]/60 bg-[#E8D2A6]/[0.07]" : "border-[#262626] bg-[#111] hover:border-[#E8D2A6]/60 hover:bg-white/[0.03]"}`}
                                >
                                    <ListVideo size={16} className="shrink-0 text-[#E8D2A6]" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[10px] uppercase tracking-[0.16em] text-neutral-500 leading-none">
                                            {selectedEpisode ? `Saison ${selectedEpisode.season_number} · Épisode ${selectedEpisode.ep_number}` : "Épisodes"}
                                        </span>
                                        <span className="mt-0.5 block truncate text-sm text-white group-hover:text-[#E8D2A6] transition-colors">
                                            {selectedEpisode?.title || "Choisir un épisode"}
                                        </span>
                                    </span>
                                    <ChevronDown size={16} className={`shrink-0 text-neutral-400 transition-transform ${episodePanelOpen ? "rotate-180 text-[#E8D2A6]" : ""}`} />
                                </button>

                                <Button
                                    variant="outline"
                                    onClick={() => nextEpisode && selectEpisode(nextEpisode)}
                                    disabled={!nextEpisode}
                                    data-testid="episode-next"
                                    title={nextEpisode ? `S${nextEpisode.season_number}E${nextEpisode.ep_number} — ${nextEpisode.title || "Sans titre"}` : "Aucun épisode suivant"}
                                    className="h-11 shrink-0 rounded-full border-[#262626] bg-transparent px-4 text-white transition-colors hover:border-[#E8D2A6]/60 hover:bg-white/5 disabled:opacity-30"
                                >
                                    <span className="hidden sm:inline">Suivant</span>
                                    <ChevronRight size={16} className="sm:ml-1.5" />
                                </Button>
                            </div>
                        )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <OfflineDownloadButton media={media} episode={media.type === "movie" ? null : selectedEpisode} className="h-10" />
                            <div className="flex items-center">
                            <AvertissementContenu media={media} />
                            <ReportDialog
                                mediaId={media.id}
                                variant="discret"
                                episode={selectedEpisode ? {
                                    season_number: selectedEpisode.season_number,
                                    episode_number: selectedEpisode.ep_number,
                                } : null}
                            />
                            </div>
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
                            bunnyPlayerRef={bunnyPlayerRef}
                            onHostChange={setIsPartyHost}
                            currentEpisode={selectedEpisode ? { season_number: selectedEpisode.season_number, episode_number: selectedEpisode.ep_number } : null}
                            onEpisodeSync={(sn, en) => {
                                const target = episodes.find((e) => String(e.season_number) === String(sn) && String(e.ep_number) === String(en));
                                if (target) selectEpisode(target);
                            }}
                            onClose={closeParty}
                            token={token}
                            adsDone={adsDone}
                            onStartedChange={setPartyStarted}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
