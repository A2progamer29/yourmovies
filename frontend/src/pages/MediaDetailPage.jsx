import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Play, Heart, Bookmark, Star, Clock, Calendar, Users, Film as FilmIcon, Pencil, Trash2, Reply, X } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFavorites } from "@/context/FavoritesContext";
import { describeError, showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Header from "@/components/Header";
import MediaCard from "@/components/MediaCard";

const POSTER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";
const BANNER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";

export default function MediaDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { setStatus: setFavStatus } = useFavorites();
    const [media, setMedia] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [similar, setSimilar] = useState([]);
    const [status, setStatus] = useState({ favorite: false, watchlist: false });
    const [ratingInput, setRatingInput] = useState(7);
    const [commentInput, setCommentInput] = useState("");
    const [editingReview, setEditingReview] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [replyInput, setReplyInput] = useState("");
    const formRef = useRef(null);

    const load = async () => {
        const [m, r, s] = await Promise.all([
            api.get(`/media/${id}`),
            api.get(`/media/${id}/reviews`),
            api.get(`/media/${id}/similar`),
        ]);
        setMedia(m.data);
        setReviews(r.data);
        setSimilar(s.data);
        if (user) {
            try {
                const s = await api.get(`/favorites/status/${id}`);
                setStatus(s.data);
            } catch (e) {
                // not logged in or error
            }
        }
    };

    useEffect(() => { load(); }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = async (list_type) => {
        if (!user) { navigate("/login"); return; }
        const r = await api.post(`/favorites/${id}?list_type=${list_type}`);
        setStatus((s) => ({ ...s, [list_type]: r.data.active }));
        setFavStatus(id, list_type, r.data.active);
        toast.success(r.data.active ? "Ajouté" : "Retiré");
    };

    const submitReview = async () => {
        if (!user) { navigate("/login"); return; }
        try {
            await api.post("/reviews", { media_id: id, rating: Number(ratingInput), comment: commentInput });
            toast.success(editingReview ? "Avis mis à jour" : "Avis publié");
            setCommentInput("");
            setEditingReview(false);
            load();
        } catch (e) {
            showError(toast, e, "Publication impossible");
        }
    };

    const startEditReview = (r) => {
        setEditingReview(true);
        setRatingInput(r.rating ?? 7);
        setCommentInput(r.comment || "");
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const deleteReview = async (rid) => {
        try {
            await api.delete(`/reviews/${rid}`);
            toast.success("Supprimé");
            load();
        } catch (e) {
            showError(toast, e, "Suppression impossible");
        }
    };

    const submitReply = async (parentId) => {
        if (!user) { navigate("/login"); return; }
        const text = replyInput.trim();
        if (!text) return;
        try {
            await api.post(`/reviews/${parentId}/reply`, { comment: text });
            setReplyInput("");
            setReplyTo(null);
            load();
        } catch (e) {
            showError(toast, e, "Réponse impossible");
        }
    };

    if (!media) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-7xl mx-auto px-6 py-20 text-neutral-400">Chargement...</div>
            </div>
        );
    }

    const banner = media.banner_url || media.poster_url || BANNER_FALLBACK;
    const totalEpisodes = (media.seasons || []).reduce((acc, s) => acc + (s.episodes?.length || 0), 0);

    const topReviews = reviews.filter((r) => !r.parent_id);
    const repliesByParent = reviews.reduce((acc, r) => {
        if (r.parent_id) {
            (acc[r.parent_id] = acc[r.parent_id] || []).push(r);
        }
        return acc;
    }, {});
    Object.values(repliesByParent).forEach((list) =>
        list.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
    );

    const renderReplyForm = (parentId) => (
        <div className="mt-3 flex items-start gap-2">
            <Textarea
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                placeholder="Votre réponse..."
                className="min-h-[60px] bg-[#111] border-[#262626] text-white placeholder:text-neutral-600 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]"
            />
            <div className="flex flex-col gap-2">
                <Button onClick={() => submitReply(parentId)} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-9 px-4 text-sm font-semibold">Envoyer</Button>
                <button onClick={() => setReplyTo(null)} className="flex items-center justify-center gap-1 text-xs text-neutral-500 hover:text-white"><X size={12} /> Annuler</button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />

            {/* Banner */}
            <section className="relative w-full h-[70vh] min-h-[480px] overflow-hidden">
                <img src={banner} alt={media.title} className="w-full h-full object-cover scale-105 blur-sm"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = BANNER_FALLBACK; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-[#050505]/20" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/90 via-transparent to-[#050505]/30" />

                {media.title_logo_url && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center px-6 pointer-events-none">
                        <img src={media.title_logo_url} alt={media.title} className="max-h-40 sm:max-h-56 w-auto max-w-[85%] object-contain drop-shadow-2xl" />
                    </div>
                )}

                <div className="relative z-10 max-w-7xl mx-auto h-full px-6 flex items-end pb-16">
                    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex gap-8 items-end">
                        <img
                            src={media.poster_url || POSTER_FALLBACK}
                            alt={media.title}
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                            className="hidden md:block w-48 lg:w-56 aspect-[2/3] object-cover rounded-lg border border-[#262626] shadow-2xl"
                        />
                        <div className="max-w-2xl">
                            <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-3">
                                {media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime"}
                                {media.year && <span className="text-neutral-500 ml-3">· {media.year}</span>}
                            </div>
                            {!media.title_logo_url && (
                                <h1 data-testid="media-title" className="font-display text-4xl sm:text-6xl tracking-tighter leading-none font-light">
                                    {media.title}
                                </h1>
                            )}
                            <div className="flex flex-wrap items-center gap-4 mt-5 text-sm text-neutral-400">
                                {media.rating && (
                                    <div className="flex items-center gap-1.5 text-white">
                                        <Star size={14} fill="#E8D2A6" className="text-[#E8D2A6]" />
                                        <span className="font-medium">{media.rating.toFixed(1)}</span>
                                        <span className="text-neutral-500">/ 10</span>
                                    </div>
                                )}
                                {media.duration_minutes && (
                                    <div className="flex items-center gap-1.5"><Clock size={14} /> {media.duration_minutes} min</div>
                                )}
                                {media.type !== "movie" && (
                                    <div className="flex items-center gap-1.5"><FilmIcon size={14} /> {media.seasons?.length || 0} saison(s) · {totalEpisodes} épisodes</div>
                                )}
                                {media.country && <div className="flex items-center gap-1.5"><Calendar size={14} /> {media.country}</div>}
                            </div>
                            {media.genres?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-4">
                                    {media.genres.map((g) => (
                                        <span key={g} className="text-xs px-3 py-1 rounded-full border border-[#262626] text-neutral-300">{g}</span>
                                    ))}
                                </div>
                            )}
                            <p className="mt-6 text-lg text-neutral-300 leading-relaxed">{media.description}</p>
                            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                                <Button
                                    onClick={() => navigate(`/watch/${media.id}`)}
                                    data-testid="watch-btn"
                                    className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-12 px-6"
                                >
                                    <Play size={16} className="mr-2" fill="currentColor" /> Regarder maintenant
                                </Button>
                                <Button
                                    onClick={() => toggle("favorite")}
                                    data-testid="toggle-favorite-btn"
                                    variant="outline"
                                    className={`rounded-full h-12 px-5 border-[#262626] bg-transparent hover:bg-white/5 ${status.favorite ? "text-[#E8D2A6] border-[#E8D2A6]/50" : "text-white"}`}
                                >
                                    <Heart size={16} className="mr-2" fill={status.favorite ? "currentColor" : "none"} />
                                    {status.favorite ? "Favori" : "Favori"}
                                </Button>
                                <Button
                                    onClick={() => toggle("watchlist")}
                                    data-testid="toggle-watchlist-btn"
                                    variant="outline"
                                    className={`rounded-full h-12 px-5 border-[#262626] bg-transparent hover:bg-white/5 ${status.watchlist ? "text-[#E8D2A6] border-[#E8D2A6]/50" : "text-white"}`}
                                >
                                    <Bookmark size={16} className="mr-2" fill={status.watchlist ? "currentColor" : "none"} />
                                    Watchlist
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12 order-2 lg:order-1">
                    {/* Trailer */}
                    {media.trailer_youtube_id && (
                        <div>
                            <h2 className="font-display text-2xl mb-4">Bande-annonce</h2>
                            <div className="aspect-video rounded-lg overflow-hidden border border-[#262626]">
                                <iframe
                                    data-testid="trailer-iframe"
                                    className="w-full h-full"
                                    src={`https://www.youtube.com/embed/${media.trailer_youtube_id}`}
                                    title="Bande-annonce"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </div>
                        </div>
                    )}

                    {/* Seasons */}
                    {media.type !== "movie" && media.seasons?.length > 0 && (
                        <div>
                            <h2 className="font-display text-2xl mb-4">Saisons</h2>
                            <Accordion type="single" collapsible className="w-full">
                                {media.seasons.map((s, i) => (
                                    <AccordionItem key={i} value={`s-${i}`} className="border-[#262626]">
                                        <AccordionTrigger data-testid={`season-${s.season_number}-trigger`} className="text-white hover:no-underline hover:text-[#E8D2A6]">
                                            <div className="flex items-baseline gap-3">
                                                <span className="text-[#E8D2A6] font-medium">Saison {s.season_number}</span>
                                                {s.title && <span className="text-neutral-400 text-sm">{s.title}</span>}
                                                <span className="text-neutral-600 text-xs">· {s.episodes?.length || 0} épisodes</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <ul className="divide-y divide-[#1a1a1a] mt-2">
                                                {(s.episodes || []).map((ep, j) => (
                                                    <li key={j} className="py-3 flex items-center justify-between gap-4">
                                                        <div>
                                                            <div className="text-white">
                                                                <span className="text-neutral-500 mr-3">E{ep.ep_number || j + 1}</span>
                                                                {ep.title || "Épisode"}
                                                            </div>
                                                            {ep.duration && <div className="text-xs text-neutral-500 mt-0.5">{ep.duration} min</div>}
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>
                    )}

                </div>

                <aside className="space-y-8 order-1 lg:order-2">
                    <Button
                        onClick={() => navigate(`/watch/${media.id}`)}
                        data-testid="watch-btn-aside"
                        className="w-full bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-12"
                    >
                        <Play size={16} className="mr-2" fill="currentColor" /> Regarder maintenant
                    </Button>
                    {(media.director || media.cast?.length > 0) && (
                        <div className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Distribution</div>
                            {media.director && (
                                <div className="mb-3">
                                    <div className="text-xs text-neutral-500">Réalisateur</div>
                                    <div className="text-white">{media.director}</div>
                                </div>
                            )}
                            {media.cast?.length > 0 && (
                                <div>
                                    <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1.5">
                                        <Users size={12} /> Casting
                                    </div>
                                    <div className="text-neutral-300 text-sm leading-relaxed">{media.cast.join(", ")}</div>
                                </div>
                            )}
                        </div>
                    )}
                </aside>
            </div>

            {similar.length > 0 && (
                <section className="max-w-7xl mx-auto px-6 pb-20" data-testid="similar-section">
                    <div className="mb-6">
                        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Vous aimerez aussi</div>
                        <h2 className="font-display text-3xl tracking-tight">Titres similaires</h2>
                    </div>
                    <div className="flex gap-5 overflow-x-auto no-scrollbar snap-x pb-2 -mx-6 px-6">
                        {similar.map((m) => (
                            <MediaCard key={m.id} media={m} size="sm" />
                        ))}
                    </div>
                </section>
            )}

            <section className="max-w-3xl mx-auto px-6 pb-24" data-testid="reviews-section">
                <h2 className="font-display text-2xl mb-4">Avis & Notes</h2>
                {user ? (
                    <div ref={formRef} className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a] mb-6">
                        <div className="flex items-center gap-3 mb-3">
                            <label className="text-sm text-neutral-400">Ma note :</label>
                            <input
                                data-testid="review-rating-input"
                                type="number"
                                min="0"
                                max="10"
                                step="0.5"
                                value={ratingInput}
                                onChange={(e) => setRatingInput(e.target.value)}
                                className="w-20 bg-[#111] border border-[#262626] text-white rounded-md px-3 py-1.5 focus:outline-none focus:border-[#E8D2A6]"
                            />
                            <span className="text-neutral-500 text-sm">/ 10</span>
                        </div>
                        <Textarea
                            data-testid="review-comment-input"
                            value={commentInput}
                            onChange={(e) => setCommentInput(e.target.value)}
                            placeholder="Écrivez votre avis..."
                            className="bg-[#111] border-[#262626] text-white placeholder:text-neutral-600 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]"
                        />
                        <div className="mt-3 flex items-center justify-end gap-3">
                            {editingReview && (
                                <button
                                    onClick={() => { setEditingReview(false); setCommentInput(""); setRatingInput(7); }}
                                    className="text-sm text-neutral-400 hover:text-white"
                                >
                                    Annuler
                                </button>
                            )}
                            <Button
                                onClick={submitReview}
                                data-testid="submit-review-btn"
                                className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold"
                            >
                                {editingReview ? "Mettre à jour" : "Publier"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="p-5 rounded-lg border border-[#262626] text-neutral-400 mb-6">
                        <Link to="/login" className="text-[#E8D2A6] hover:underline">Connectez-vous</Link> pour laisser un avis.
                    </div>
                )}

                {topReviews.length === 0 ? (
                    <div className="text-neutral-500 text-sm">Aucun avis pour le moment. Soyez le premier.</div>
                ) : (
                    <div className="space-y-4">
                        {topReviews.map((r) => {
                            const mine = user && r.user_id === user.user_id;
                            const replies = repliesByParent[r.id] || [];
                            return (
                                <div key={r.id} className="p-5 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
                                    <div className="flex items-center justify-between">
                                        <Link to={`/u/${r.user_id}`} className="flex items-center gap-2 group/user">
                                            <div className="w-8 h-8 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-sm font-semibold">
                                                {r.user_name?.[0]?.toUpperCase() || "U"}
                                            </div>
                                            <div className="text-white text-sm group-hover/user:text-[#E8D2A6] transition-colors">{r.user_name}</div>
                                        </Link>
                                        {typeof r.rating === "number" && (
                                            <div className="flex items-center gap-1 text-[#E8D2A6] text-sm">
                                                <Star size={12} fill="#E8D2A6" /> {r.rating.toFixed(1)}
                                            </div>
                                        )}
                                    </div>
                                    {r.comment && <p className="mt-3 text-neutral-300 text-sm leading-relaxed">{r.comment}</p>}

                                    {user && (
                                        <div className="mt-3 flex items-center gap-4 text-xs">
                                            {mine ? (
                                                <>
                                                    <button onClick={() => startEditReview(r)} className="flex items-center gap-1 text-neutral-500 hover:text-white">
                                                        <Pencil size={12} /> Modifier
                                                    </button>
                                                    <button onClick={() => deleteReview(r.id)} className="flex items-center gap-1 text-neutral-500 hover:text-red-400">
                                                        <Trash2 size={12} /> Supprimer
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => { setReplyTo(replyTo === r.id ? null : r.id); setReplyInput(""); }} className="flex items-center gap-1 text-neutral-500 hover:text-[#E8D2A6]">
                                                    <Reply size={12} /> Répondre
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {replyTo === r.id && renderReplyForm(r.id)}

                                    {replies.length > 0 && (
                                        <div className="mt-4 space-y-3 pl-4 border-l border-[#1a1a1a]">
                                            {replies.map((rp) => {
                                                const mineReply = user && rp.user_id === user.user_id;
                                                return (
                                                    <div key={rp.id}>
                                                        <Link to={`/u/${rp.user_id}`} className="flex items-center gap-2 group/user">
                                                            <div className="w-6 h-6 rounded-full bg-[#262626] text-neutral-200 flex items-center justify-center text-xs font-semibold">
                                                                {rp.user_name?.[0]?.toUpperCase() || "U"}
                                                            </div>
                                                            <div className="text-neutral-200 text-sm group-hover/user:text-[#E8D2A6] transition-colors">{rp.user_name}</div>
                                                        </Link>
                                                        <p className="mt-1.5 ml-8 text-neutral-400 text-sm leading-relaxed">
                                                            {rp.reply_to_name && <span className="text-[#E8D2A6]">@{rp.reply_to_name} </span>}
                                                            {rp.comment}
                                                        </p>
                                                        {user && (
                                                            <div className="mt-1 ml-8 flex items-center gap-4 text-xs">
                                                                {!mineReply && (
                                                                    <button onClick={() => { setReplyTo(replyTo === rp.id ? null : rp.id); setReplyInput(""); }} className="flex items-center gap-1 text-neutral-600 hover:text-[#E8D2A6]">
                                                                        <Reply size={11} /> Répondre
                                                                    </button>
                                                                )}
                                                                {mineReply && (
                                                                    <button onClick={() => deleteReview(rp.id)} className="flex items-center gap-1 text-neutral-600 hover:text-red-400">
                                                                        <Trash2 size={11} /> Supprimer
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {replyTo === rp.id && <div className="ml-8">{renderReplyForm(rp.id)}</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
