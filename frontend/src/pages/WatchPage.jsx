import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, Users, Play } from "lucide-react";
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
    const [bunnyReady, setBunnyReady] = useState(null); // null=inconnu ; {ready, encodeProgress}
    const [adDone, setAdDone] = useState(false);

    useEffect(() => {
        const vid = media?.bunny_video_id;
        if (!vid) { setBunnyReady(null); return; }
        let active = true;
        let timer;
        const check = async () => {
            try {
                const s = await api.get(`/bunny/video-status/${vid}`, { silent: true });
                if (!active) return;
                const st = Number(s.data.status);
                const hasRes = !!(s.data.availableResolutions && String(s.data.availableResolutions).length);
                if (st >= 4 || hasRes) { setBunnyReady({ ready: true }); return; }
                setBunnyReady({ ready: false, encodeProgress: s.data.encodeProgress || 0 });
                timer = setTimeout(check, 5000);
            } catch {
                if (active) setBunnyReady({ ready: true });
            }
        };
        check();
        return () => { active = false; clearTimeout(timer); };
    }, [media?.bunny_video_id]);

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
    const hasVideo = !!(media.bunny_video_id || qualities.length > 0);
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
                                    <Users size={14} className="mr-2" /> Watch Party
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
                        ) : media.bunny_video_id ? (
                            <div className="relative w-full rounded-lg overflow-hidden border border-[#262626]" style={{ aspectRatio: "16 / 9" }}>
                                <iframe
                                    data-testid="bunny-player"
                                    src={`https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${media.bunny_video_id}?autoplay=true&preload=true`}
                                    loading="lazy"
                                    className="absolute inset-0 w-full h-full"
                                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                                    allowFullScreen
                                    title={media.title}
                                />
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

                        {resumeAt > 0 && !media.bunny_video_id && (
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
