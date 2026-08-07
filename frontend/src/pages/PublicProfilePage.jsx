import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Star, Crown, Shield, Calendar, MessageSquare, Send, UserPlus, UserCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

const POSTER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";
const CREATOR_ID = "user_22e47c166f77";

export default function PublicProfilePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [notFound, setNotFound] = useState(false);
    const [following, setFollowing] = useState(false);
    const [followers, setFollowers] = useState(0);

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get(`/users/${id}/public`);
                setProfile(r.data);
                setFollowing(!!r.data.is_following);
                setFollowers(r.data.followers || 0);
            } catch (e) {
                setNotFound(true);
            }
        })();
    }, [id]);

    const toggleFollow = async () => {
        if (!user) { navigate("/login"); return; }
        try {
            const r = await api.post(`/users/${profile.user_id}/follow`);
            setFollowing(r.data.is_following);
            setFollowers(r.data.followers);
        } catch (e) { showError(toast, e, "Action impossible"); }
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-3xl mx-auto px-6 py-20 text-center text-neutral-400">Utilisateur introuvable.</div>
            </div>
        );
    }
    if (!profile) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-3xl mx-auto px-6 py-20 text-neutral-500">Chargement...</div>
            </div>
        );
    }

    const initial = profile.name?.[0]?.toUpperCase() || "U";

    return (
        <div className="min-h-screen text-white" style={{ backgroundColor: profile.profile_background_color || "#050505" }}>
            <div className="noise-overlay" />
            <Header />
            <section className="relative isolate min-h-[300px] overflow-hidden border-b border-[#262626]">
                {profile.banner ? (
                    <img src={profile.banner} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
                ) : (
                    <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_20%,rgba(232,210,166,0.16),transparent_38%),linear-gradient(135deg,#17130d_0%,#050505_58%,#101010_100%)]" />
                )}
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[var(--profile-bg)] via-transparent to-black/30" style={{ "--profile-bg": profile.profile_background_color || "#050505" }} />
                <div className="mx-auto flex min-h-[300px] max-w-7xl items-end px-6 pb-10 pt-20">
                <div className="flex w-full flex-col gap-5 sm:flex-row sm:items-end">
                    {profile.picture ? (
                        <img src={profile.picture} alt={profile.name} className="w-20 h-20 rounded-full object-cover border border-[#262626]" />
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-3xl font-semibold">{initial}</div>
                    )}
                    <div className="min-w-0">
                        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2 flex-wrap">
                            {profile.name}
                            {profile.premium && <Crown size={18} className="text-[#E8D2A6]" />}
                            {profile.is_admin && <Shield size={16} className="text-[#E8D2A6]" />}
                            {profile.user_id === CREATOR_ID && (
                                <span className="text-[10px] leading-none uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#E8D2A6] text-black font-bold">Créateur</span>
                            )}
                        </h1>
                        <div className="text-sm text-neutral-500 mt-1.5 flex items-center gap-4 flex-wrap">
                            <span className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${profile.online ? "bg-emerald-400" : "bg-neutral-600"}`} />
                                <span className={profile.online ? "text-emerald-400" : "text-neutral-500"}>{profile.online ? "En ligne" : "Hors ligne"}</span>
                            </span>
                            <span><span className="text-white font-medium">{followers}</span> abonnés</span>
                            <span><span className="text-white font-medium">{profile.following}</span> abonnements</span>
                            {!profile.private && <span className="flex items-center gap-1.5"><MessageSquare size={13} /> {profile.review_count} avis</span>}
                            {profile.created_at && (
                                <span className="flex items-center gap-1.5"><Calendar size={13} /> Membre depuis {new Date(profile.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>
                            )}
                        </div>
                    </div>
                    {user && !profile.is_self && (
                        <div className="ml-auto flex items-center gap-2 shrink-0">
                            <Button onClick={toggleFollow} data-testid="follow-btn" variant={following ? "outline" : "default"} className={following ? "rounded-full border-[#262626] bg-transparent text-white hover:bg-white/5 font-semibold" : "rounded-full bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] font-semibold"}>
                                {following ? <><UserCheck size={15} className="mr-2" /> Suivi</> : <><UserPlus size={15} className="mr-2" /> Suivre</>}
                            </Button>
                            <Button onClick={() => navigate(`/messages/${profile.user_id}`)} data-testid="send-message-btn" variant="outline" className="rounded-full border-[#262626] bg-transparent text-white hover:bg-white/5 font-semibold">
                                <Send size={15} className="mr-2" /> Message
                            </Button>
                        </div>
                    )}
                </div>
                </div>
            </section>

            <div className="max-w-3xl mx-auto px-6 py-12">
                {profile.private && (
                    <div className="p-10 rounded-lg border border-[#262626] bg-[#0a0a0a] text-center text-neutral-400 flex flex-col items-center gap-3">
                        <Lock size={24} className="text-neutral-600" />
                        Ce profil est privé.
                    </div>
                )}

                {!profile.private && (
                    <>
                        {profile.bio && (
                            <div className="mb-10 p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">À propos</div>
                                <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">{profile.bio}</p>
                            </div>
                        )}

                        {profile.watched?.length > 0 && (
                            <div className="mb-10">
                                <h2 className="font-display text-2xl mb-4">Top 10 — derniers visionnages</h2>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                                    {profile.watched.map((w, i) => (
                                        <Link key={w.id} to={`/media/${w.id}`} className="group">
                                            <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-[#1a1a1a] group-hover:border-[#E8D2A6]/40 transition-colors bg-[#111]">
                                                <img
                                                    src={w.poster_url || POSTER_FALLBACK}
                                                    alt={w.title}
                                                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 text-[#E8D2A6] text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                                            </div>
                                            <div className="text-xs text-neutral-400 mt-1 truncate group-hover:text-[#E8D2A6] transition-colors">{w.title}</div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        {profile.history_hidden && (
                            <div className="mb-10 text-sm text-neutral-500 flex items-center gap-2"><Lock size={14} /> L&apos;historique de cet utilisateur est masqué.</div>
                        )}

                        <h2 className="font-display text-2xl mb-4">Avis récents</h2>
                        {profile.reviews_hidden ? (
                            <div className="text-neutral-500 text-sm flex items-center gap-2"><Lock size={14} /> Les avis de cet utilisateur sont masqués.</div>
                        ) : !profile.reviews || profile.reviews.length === 0 ? (
                            <div className="text-neutral-500 text-sm">Aucun avis publié.</div>
                        ) : (
                            <div className="space-y-3">
                                {profile.reviews.map((r) => (
                                    <Link key={r.id} to={`/media/${r.media_id}`} className="flex gap-4 p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#E8D2A6]/40 transition-colors">
                                        <img
                                            src={r.poster_url || POSTER_FALLBACK}
                                            alt=""
                                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                                            className="w-12 h-[72px] object-cover rounded bg-[#111] shrink-0"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-white font-medium truncate">{r.media_title || "Titre"}</div>
                                                {typeof r.rating === "number" && (
                                                    <div className="flex items-center gap-1 text-[#E8D2A6] text-sm shrink-0"><Star size={12} fill="#E8D2A6" /> {r.rating.toFixed(1)}</div>
                                                )}
                                            </div>
                                            {r.comment && <p className="text-sm text-neutral-400 mt-1 line-clamp-3">{r.comment}</p>}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
