import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Star, Crown, Shield, Calendar, MessageSquare, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
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

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get(`/users/${id}/public`);
                setProfile(r.data);
            } catch (e) {
                setNotFound(true);
            }
        })();
    }, [id]);

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
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="flex items-center gap-5 mb-10">
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
                            <span className="flex items-center gap-1.5"><MessageSquare size={13} /> {profile.review_count} avis</span>
                            {profile.created_at && (
                                <span className="flex items-center gap-1.5"><Calendar size={13} /> Membre depuis {new Date(profile.created_at).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>
                            )}
                        </div>
                    </div>
                    {user && user.user_id !== profile.user_id && (
                        <Button onClick={() => navigate(`/messages/${profile.user_id}`)} data-testid="send-message-btn" className="ml-auto bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold shrink-0">
                            <Send size={15} className="mr-2" /> Message
                        </Button>
                    )}
                </div>

                <h2 className="font-display text-2xl mb-4">Avis récents</h2>
                {profile.reviews?.length === 0 ? (
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
            </div>
        </div>
    );
}
