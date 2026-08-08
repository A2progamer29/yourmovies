import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, Users, Play, Film } from "lucide-react";
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
    const [resumeAt, setResumeAt] = useState(0);
    const [partyCode, setPartyCode] = useState(searchParams.get("party") || "");
    const [joinInput, setJoinInput] = useState("");
    const [partyOpen, setPartyOpen] = useState(Boolean(searchParams.get("party")));
    const videoElRef = useRef(null);
    const [bunnyReady, setBunnyReady] = useState(null); // null=inconnu ; {ready, encodeProgress, libraryId}
    const [bunnyPlaybackUrl, setBunnyPlaybackUrl] = useState(null);
    const [adDone, setAdDone] = useState(false);
    const bunnySource = resolveBunnySource(media);

    useEffect(() => {
        if (!bunnySource?.videoId) {
            setBunnyPlaybackUrl(null);
            return;
        }
        let active = true;
        setBunnyPlaybackUrl(null);
        api.get(`/bunny/playback/${id}`, { silent: true })
            .then((response) => {
                if (active) setBunnyPlaybackUrl(response.data?.url || null);
            })
            .catch(() => {
                if (!active) return;
                // Compatibilité avec les anciennes bibliothèques Bunny publiques.
                setBunnyPlaybackUrl(
                    `https://iframe.mediadelivery.net/embed/${bunnySource.libraryId}/${bunnySource.videoId}?autoplay=true&preload=true&responsive=true`
                );
            });
        return () => { active = false; };
    }, [id, bunnySource?.videoId, bunnySource?.libraryId]);

    useEffect(() => {
        const vid = bunnySource?.videoId;
        if (!vid) { setBunnyReady(null); return; }
        let active = true;
        let timer;
        const check = async () => {
            try {
                const s = await api.get(`/bunny/video-status/${vid}`, { silent: true });
                if (!active) return;
                const st = Number(s.data.status);
                const hasRes = !!(s.data.availableResolutions && String(s.data.availableResolutions).length);
                const libraryId = String(bunnySource?.libraryId || s.data.libraryId || BUNNY_LIBRARY_ID);
                if (st >= 4 || hasRes) { setBunnyReady({ ready: true, libraryId }); return; }
                setBunnyReady({ ready: false, encodeProgress: s.data.encodeProgress || 0, libraryId });
                timer = setTimeout(check, 5000);
            } catch {
                if (active) setBunnyReady({ ready: true });
            }
        };
        check();
        return () => { active = false; clearTimeout(timer); };
    }, [bunnySource?.videoId, bunnySource?.libraryId]);

    useEffect(() => {
        (async () => {
            const r = await api.get(`/media/${id}`);
            setMedia(r.data);
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
            await api.post("/watch-progress", { media_id: id, position_seconds: pos, duration_seconds: dur });
        } catch (e) { }
    }, [id, user]);

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

    const qualities = fallbackQualities(media);
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
                        {showAd ? (
                            <div className="relative w-full rounded-lg overflow-hidden border border-[#262626]" style={{ aspectRatio: "16 / 9" }}>
                                <PreRollAd onDone={() => setAdDone(true)} />
                            </div>
                        ) : bunnySource ? (
                            <div className="relative w-full rounded-lg overflow-hidden border border-[#262626]" style={{ aspectRatio: "16 / 9" }}>
                                {bunnyPlaybackUrl ? (
                                    <iframe
                                        data-testid="bunny-player"
                                        src={bunnyPlaybackUrl}
                                        loading="eager"
                                        className="absolute inset-0 w-full h-full"
                                        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                                        allowFullScreen
                                        referrerPolicy="strict-origin-when-cross-origin"
                                        title={media.title}
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0a0a0a] to-[#050505]">
                                        <div className="text-center text-sm text-neutral-400">
                                            <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-transparent border-t-[#E8D2A6] animate-spin" />
                                            Autorisation du lecteur…
                                        </div>
                                    </div>
                                )}
                                {bunnyReady && bunnyReady.ready === false && (
                                    <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] to-[#050505] flex items-center justify-center">
                                        <div className="text-center px-6 w-full max-w-sm">
                                            <div className="relative w-20 h-20 mx-auto mb-5">
                                                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#E8D2A6] border-r-[#E8D2A6]/30 animate-spin" />
                                                <img src="/logo.png" alt="" className="absolute inset-[7px] rounded-full object-cover" />
                                            </div>
                                            <div className="font-display text-xl sm:text-2xl text-white mb-1.5">Préparation de la vidéo…</div>
                                            <div className="text-sm text-neutral-400 mb-4">Encodage en cours — la lecture démarrera automatiquement</div>
                                            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                <div className="h-full bg-[#E8D2A6] transition-all duration-500" style={{ width: `${Math.max(3, bunnyReady.encodeProgress || 0)}%` }} />
                                            </div>
                                            <div className="text-xs text-[#E8D2A6] mt-2">{bunnyReady.encodeProgress || 0}%</div>
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

                        {media.description && (
                            <p className="mt-8 text-neutral-300 leading-relaxed max-w-3xl">{media.description}</p>
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
