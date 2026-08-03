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

const PLAN_MAX_QUALITY = {
    null: "720p",
    undefined: "720p",
    basic: "1080p",
    standard: "1080p",
    premium: "4k",
};

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
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [media, setMedia] = useState(null);
    const [resumeAt, setResumeAt] = useState(0);
    const [partyCode, setPartyCode] = useState(searchParams.get("party") || "");
    const [joinInput, setJoinInput] = useState("");
    const [partyOpen, setPartyOpen] = useState(Boolean(searchParams.get("party")));
    const videoElRef = useRef(null);

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
    const userMaxQuality = PLAN_MAX_QUALITY[user?.premium_plan] || "720p";
    const runAds = !user?.premium;
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
                                <div className="flex items-center gap-2">
                                    <Input
                                        data-testid="party-join-input"
                                        value={joinInput}
                                        onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                                        placeholder="Code Watch Party"
                                        maxLength={6}
                                        className="bg-[#111] border-[#262626] text-white w-40 tracking-widest uppercase"
                                    />
                                    <Button variant="outline" onClick={joinParty} data-testid="party-join-btn" className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full h-10 px-4">
                                        Rejoindre
                                    </Button>
                                </div>
                                <Button
                                    onClick={createParty}
                                    data-testid="party-create-btn"
                                    className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-10 px-5"
                                >
                                    <Users size={14} className="mr-2" /> Watch Party
                                </Button>
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
                    <div>
                        {qualities.length === 0 ? (
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
                                runAds={runAds && !partyOpen}
                                preferredQuality={user?.preferred_quality}
                                videoRefOut={videoElRef}
                            />
                        )}

                        <div className="mt-4 text-xs text-neutral-500 flex items-center gap-3 flex-wrap">
                            <span>Qualité max autorisée : <span className="text-[#E8D2A6]">{userMaxQuality.toUpperCase()}</span></span>
                            {!user?.premium && <span>· Passez <Link to="/pricing" className="text-[#E8D2A6] hover:underline">Premium</Link> pour la 4K sans pub</span>}
                            {resumeAt > 0 && <span>· Reprise à {Math.floor(resumeAt / 60)}m {Math.floor(resumeAt % 60)}s</span>}
                        </div>

                        {media.description && (
                            <p className="mt-8 text-neutral-300 leading-relaxed max-w-3xl">{media.description}</p>
                        )}
                    </div>

                    {partyOpen && partyCode && (
                        <WatchParty
                            code={partyCode}
                            currentUserId={user?.user_id}
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
