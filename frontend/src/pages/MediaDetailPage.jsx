import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Play, Heart, Bookmark, Star, Clock, Calendar, Users, Film as FilmIcon, Pencil, Trash2, Reply, X, ArrowRight, GitBranch, TriangleAlert } from "lucide-react";
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
import ReportDialog from "@/components/ReportDialog";
import { FicheSkeleton } from "@/components/Skeletons";
import MediaCard from "@/components/MediaCard";
import HScroller from "@/components/HScroller";
import AvertissementContenu from "@/components/AvertissementContenu";
import OfflineDownloadButton from "@/components/OfflineDownloadButton";
import { findOfflineMedia, hasPremiumOfflineAccess } from "@/lib/offline";

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
    const [timeline, setTimeline] = useState({ title: "", items: [] });
    const [tab, setTab] = useState(null);
    const [status, setStatus] = useState({ favorite: false, watchlist: false });
    const [ratingInput, setRatingInput] = useState(7);
    const [commentInput, setCommentInput] = useState("");
    const [editingReview, setEditingReview] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [replyInput, setReplyInput] = useState("");
    const [qualityWarningOpen, setQualityWarningOpen] = useState(false);
    const formRef = useRef(null);

    const load = async () => {
        if (!navigator.onLine) {
            if (!hasPremiumOfflineAccess(user)) return;
            const saved = await findOfflineMedia(id, user.user_id).catch(() => null);
            if (saved) {
                setMedia(saved);
                setReviews([]);
                setSimilar([]);
                setTimeline({ title: "", items: [] });
                return;
            }
        }
        const [m, r, s, t] = await Promise.all([
            api.get(`/media/${id}`),
            api.get(`/media/${id}/reviews`),
            api.get(`/media/${id}/similar`),
            api.get(`/media/${id}/timeline`).catch(() => ({ data: { title: "", items: [] } })),
        ]);
        setMedia(m.data);
        setReviews(r.data);
        setSimilar(s.data);
        setTimeline(t.data || { title: "", items: [] });
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
                <FicheSkeleton />
            </div>
        );
    }

    const banner = media.banner_url || media.poster_url || BANNER_FALLBACK;
    const totalEpisodes = (media.seasons || []).reduce((acc, s) => acc + (s.episodes?.length || 0), 0);

    // Les rubriques restent accessibles même quand une source ne fournit pas encore chaque détail.
    const sections = [
        media.type !== "movie" && { id: "episodes", label: "Épisodes" },
        media.trailer_youtube_id && { id: "trailer", label: "Bande-annonce" },
        { id: "cast", label: "Distribution" },
        { id: "reviews", label: `Avis${reviews.filter((r) => !r.parent_id).length ? ` (${reviews.filter((r) => !r.parent_id).length})` : ""}` },
        { id: "chronology", label: "Chronologie" },
        similar.length > 0 && { id: "similar", label: "Similaires" },
    ].filter(Boolean);
    const activeTab = sections.some((s) => s.id === tab) ? tab : (sections[0]?.id || "reviews");

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

            {qualityWarningOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4" role="dialog" aria-modal="true" aria-labelledby="cinema-warning-title">
                    <div className="w-full max-w-lg rounded-2xl border border-[#E8D2A6]/30 bg-[#0a0a0a] p-7 text-center shadow-2xl">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#E8D2A6]/40 bg-[#E8D2A6]/10"><FilmIcon size={25} className="text-[#E8D2A6]" /></div>
                        <h2 id="cinema-warning-title" className="mt-5 font-display text-3xl tracking-tight">Film actuellement au cinéma</h2>
                        <p className="mt-3 text-sm leading-relaxed text-neutral-400">Ce film vient de sortir au cinéma. La version disponible peut donc ne pas être proposée dans une qualité optimale.</p>
                        <div className="mt-7 flex flex-col-reverse justify-center gap-3 sm:flex-row">
                            <Button variant="outline" onClick={() => setQualityWarningOpen(false)} className="rounded-full border-[#333] bg-transparent px-6 text-white hover:bg-white/5">Retour à la fiche</Button>
                            <Button onClick={() => navigate(`/watch/${media.id}?cinema-warning=accepted`)} className="rounded-full bg-[#E8D2A6] px-6 font-semibold text-black hover:bg-[#D4BB8B]">Continuer quand même</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Immersive banner */}
            <section className="relative w-full h-[52vh] min-h-[390px] md:h-[60vh] md:min-h-[520px] overflow-hidden">
                <img src={banner} alt={media.title} className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = BANNER_FALLBACK; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/35 to-black/20" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/80 via-[#050505]/15 to-transparent" />
            </section>

            {/* Main identity card */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 -mt-32 md:-mt-44">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55 }}
                    className="rounded-2xl border border-white/10 bg-[#0a0a0a]/95 shadow-2xl shadow-black/60 backdrop-blur-xl p-5 sm:p-7 lg:p-8"
                >
                    <div className="flex gap-5 md:gap-8 items-end">
                        <img
                            src={media.poster_url || POSTER_FALLBACK}
                            alt={media.title}
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                            className="hidden sm:block w-32 md:w-44 lg:w-52 shrink-0 aspect-[2/3] object-cover rounded-xl border border-white/10 shadow-2xl"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-3">
                                {media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime"}
                                {media.year && <span className="text-neutral-500 ml-3">· {media.year}</span>}
                            </div>
                            {media.title_logo_url ? (
                                <img src={media.title_logo_url} alt={media.title} className="max-h-20 sm:max-h-28 lg:max-h-32 max-w-[90%] w-auto object-contain object-left drop-shadow-xl" />
                            ) : (
                                <h1 data-testid="media-title" className="font-display text-3xl sm:text-5xl lg:text-6xl tracking-tighter leading-none font-light">
                                    {media.title}
                                </h1>
                            )}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5 text-sm text-neutral-400">
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
                            <p className="mt-5 text-sm sm:text-base text-neutral-300 leading-relaxed max-w-3xl line-clamp-4 sm:line-clamp-none">{media.description}</p>
                            {(media.player_broken || media.reports_flagged) && (
                                <div className="mt-6 flex max-w-2xl items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-amber-100/90" data-testid="player-notice">
                                    <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />
                                    <span>
                                        {media.player_broken
                                            ? (media.player_notice || "Le lecteur de ce contenu est momentanément indisponible. Nous travaillons à le rétablir.")
                                            : "Plusieurs personnes ont signalé un problème sur ce titre. La lecture risque de ne pas fonctionner correctement."}
                                    </span>
                                </div>
                            )}
                            <div className="mt-6 flex flex-wrap items-center gap-3">
                                <Button
                                    onClick={() => media.in_theaters ? setQualityWarningOpen(true) : navigate(`/watch/${media.id}`)}
                                    data-testid="watch-btn"
                                    className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-12 px-6"
                                >
                                    <Play size={16} className="mr-2" fill="currentColor" /> Regarder maintenant
                                </Button>
                                {media.type === "movie" && <OfflineDownloadButton media={media} />}
                                <ReportDialog mediaId={media.id} />
                                <AvertissementContenu media={media} />
                                <Button
                                    onClick={() => toggle("favorite")}
                                    data-testid="toggle-favorite-btn"
                                    variant="outline"
                                    className={`rounded-full h-12 px-5 border-[#262626] bg-transparent hover:bg-white/5 ${status.favorite ? "text-[#E8D2A6] border-[#E8D2A6]/50" : "text-white"}`}
                                >
                                    <Heart size={16} className="mr-2" fill={status.favorite ? "currentColor" : "none"} />
                                    {status.favorite ? "Dans mes favoris" : "Ajouter aux favoris"}
                                </Button>
                                <Button
                                    onClick={() => toggle("watchlist")}
                                    data-testid="toggle-watchlist-btn"
                                    variant="outline"
                                    className={`rounded-full h-12 px-5 border-[#262626] bg-transparent hover:bg-white/5 ${status.watchlist ? "text-[#E8D2A6] border-[#E8D2A6]/50" : "text-white"}`}
                                >
                                    <Bookmark size={16} className="mr-2" fill={status.watchlist ? "currentColor" : "none"} />
                                    {status.watchlist ? "Dans ma liste" : "À voir plus tard"}
                                </Button>
                            </div>
                            {media.type === "movie" && (media.language_tracks || []).some((p) => p?.label && p?.available) && (
                                <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="media-pistes">
                                    <span className="mr-1 text-[10px] uppercase tracking-widest text-neutral-500">Version</span>
                                    <Link
                                        to={`/watch/${media.id}`}
                                        className="rounded-full border border-[#262626] px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-[#E8D2A6]/60 hover:text-[#E8D2A6]"
                                    >
                                        Principale
                                    </Link>
                                    {media.language_tracks.filter((p) => p?.label && p?.available).map((p) => (
                                        <Link
                                            key={p.label}
                                            to={`/watch/${media.id}?piste=${encodeURIComponent(p.label)}`}
                                            className="rounded-full border border-[#262626] px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-[#E8D2A6]/60 hover:text-[#E8D2A6]"
                                        >
                                            {p.label}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
                <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-white/10" role="tablist">
                    {sections.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === s.id}
                            onClick={() => setTab(s.id)}
                            data-testid={`media-tab-${s.id}`}
                            className={`shrink-0 border-b-2 -mb-px px-4 py-3 text-sm transition-colors ${activeTab === s.id
                                ? "border-[#E8D2A6] text-[#E8D2A6]"
                                : "border-transparent text-neutral-400 hover:text-white"}`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-12 space-y-14">
                <main className="space-y-14 min-w-0">
                    {/* Trailer */}
                    {activeTab === "trailer" && media.trailer_youtube_id && (
                        <section>
                            <div className="flex items-end justify-between mb-5">
                                <div>
                                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#E8D2A6] mb-1">À découvrir</div>
                                    <h2 className="font-display text-3xl tracking-tight">Bande-annonce</h2>
                                </div>
                            </div>
                            <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl shadow-black/30">
                                <iframe
                                    data-testid="trailer-iframe"
                                    className="w-full h-full"
                                    src={`https://www.youtube.com/embed/${media.trailer_youtube_id}`}
                                    title="Bande-annonce"
                                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </div>
                        </section>
                    )}

                    {/* Seasons */}
                    {activeTab === "episodes" && media.type !== "movie" && media.seasons?.length > 0 && (
                        <section>
                            <div className="mb-5">
                                <div className="text-[11px] uppercase tracking-[0.22em] text-[#E8D2A6] mb-1">Épisodes</div>
                                <h2 className="font-display text-3xl tracking-tight">Saisons</h2>
                            </div>
                            <Accordion type="single" collapsible className="w-full rounded-2xl border border-white/10 bg-[#0a0a0a] px-5">
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
                                                {(s.episodes || []).map((ep, j) => {
                                                    const seasonNo = s.season_number || i + 1;
                                                    const epNo = ep.ep_number || j + 1;
                                                    const playable = Boolean(
                                                        ep.has_primary_video
                                                        || ep.video_url
                                                        || ep.video_file_path
                                                        || (ep.language_tracks || []).some((piste) => piste?.available),
                                                    );
                                                    const label = ep.title || "Épisode";

                                                    if (!playable) {
                                                        return (
                                                            <li key={j} className="py-5 px-1 flex items-center justify-between gap-4 opacity-60">
                                                                <div>
                                                                    <div className="text-neutral-300">
                                                                        <span className="text-neutral-500 mr-3">E{epNo}</span>
                                                                        {label}
                                                                    </div>
                                                                    {ep.duration && <div className="text-xs text-neutral-500 mt-0.5">{ep.duration} min</div>}
                                                                </div>
                                                                <span className="shrink-0 text-[11px] text-neutral-500">Bientôt</span>
                                                            </li>
                                                        );
                                                    }

                                                    const pistesEp = (ep.language_tracks || []).filter((p) => p?.label && p?.available);
                                                    const aPrincipale = Boolean(ep.has_primary_video || ep.video_url || ep.video_file_path);

                                                    return (
                                                        <li key={j} className="flex items-center gap-2">
                                                            <Link
                                                                to={`/watch/${media.id}?season=${seasonNo}&episode=${epNo}`}
                                                                data-testid={`episode-play-${seasonNo}-${epNo}`}
                                                                className="group -mx-3 flex min-w-0 flex-1 items-center justify-between gap-4 border-l-2 border-transparent px-4 py-5 transition-[border-color,padding] duration-200 hover:border-[#E8D2A6] hover:pl-6"
                                                            >
                                                                <span className="flex min-w-0 items-center gap-3">
                                                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#262626] text-neutral-400 transition-colors group-hover:border-[#E8D2A6] group-hover:bg-[#E8D2A6] group-hover:text-black">
                                                                        <Play size={15} fill="currentColor" />
                                                                    </span>
                                                                    <span className="min-w-0">
                                                                        <span className="block text-white transition-colors group-hover:text-[#E8D2A6]">
                                                                            <span className="text-neutral-500 mr-3">E{epNo}</span>
                                                                            {label}
                                                                        </span>
                                                                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                                                                            {ep.duration && <span>{ep.duration} min</span>}
                                                                            {!aPrincipale && pistesEp.length > 0 && (
                                                                                <span className="text-[#E8D2A6]">{pistesEp[0].label}</span>
                                                                            )}
                                                                        </span>
                                                                    </span>
                                                                </span>
                                                                <span className="shrink-0 text-[11px] text-neutral-600 transition-colors group-hover:text-[#E8D2A6]">Regarder</span>
                                                            </Link>
                                                            {(aPrincipale && pistesEp.length > 0) && (
                                                                <div className="flex flex-wrap items-center gap-1.5" data-testid={`episode-pistes-${seasonNo}-${epNo}`}>
                                                                    <Link
                                                                        to={`/watch/${media.id}?season=${seasonNo}&episode=${epNo}`}
                                                                        className="rounded-full border border-[#262626] px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-[#E8D2A6]/60 hover:text-[#E8D2A6]"
                                                                    >
                                                                        Principale
                                                                    </Link>
                                                                    {pistesEp.map((p) => (
                                                                        <Link
                                                                            key={p.label}
                                                                            to={`/watch/${media.id}?season=${seasonNo}&episode=${epNo}&piste=${encodeURIComponent(p.label)}`}
                                                                            className="rounded-full border border-[#262626] px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:border-[#E8D2A6]/60 hover:text-[#E8D2A6]"
                                                                        >
                                                                            {p.label}
                                                                        </Link>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <OfflineDownloadButton media={media} episode={{ ...ep, season_number: seasonNo, ep_number: epNo }} compact />
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </section>
                    )}

                </main>

                <aside className="w-full">
                    {activeTab === "cast" && (
                        <div className="p-6 rounded-2xl border border-white/10 bg-[#0a0a0a]">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-[#E8D2A6] mb-5">Distribution</div>
                            {media.director && (
                                <div className="mb-5 pb-5 border-b border-white/5">
                                    <div className="text-xs text-neutral-500">Réalisateur</div>
                                    <div className="text-white mt-1">{media.director}</div>
                                </div>
                            )}
                            {media.cast?.length > 0 && (
                                <div>
                                    <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1.5">
                                        <Users size={12} /> Casting
                                    </div>
                                    <div className="text-neutral-300 text-sm leading-relaxed mt-2">{media.cast.join(", ")}</div>
                                </div>
                            )}
                            {!media.director && !media.cast?.length && (
                                <p className="text-sm text-neutral-500">Les informations de distribution ne sont pas encore disponibles pour ce titre.</p>
                            )}
                        </div>
                    )}
                </aside>
            </div>

            {activeTab === "chronology" && (
                <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-white/5" data-testid="media-timeline-section">
                    <div className="mb-7 flex items-end justify-between gap-4">
                        <div>
                            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#E8D2A6]">
                                <GitBranch size={13} /> Ordre de visionnage
                            </div>
                            <h2 className="font-display text-3xl tracking-tight">{timeline.title}</h2>
                            <p className="mt-2 max-w-2xl text-sm text-neutral-500">Découvrez les œuvres liées dans l’ordre conseillé.</p>
                        </div>
                    </div>

                    {timeline.items?.length > 1 ? <HScroller
                        testId="media-timeline-scroller"
                        itemClassName="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-6 pb-4 pt-3 no-scrollbar scroll-smooth sm:-mx-6 sm:px-9 [scroll-padding-inline:2rem]"
                    >
                        {timeline.items.map((item, index) => {
                            const CardTag = item.available ? Link : "div";
                            const cardProps = item.available ? { to: `/media/${item.media_id}` } : {};
                            return (
                                <React.Fragment key={`${item.tmdb_id || item.title}-${index}`}>
                                    <CardTag
                                        {...cardProps}
                                        aria-current={item.current ? "page" : undefined}
                                        className={`group w-[150px] shrink-0 snap-start sm:w-[176px] ${item.available ? "cursor-pointer" : "cursor-default"}`}
                                    >
                                        <div className={`relative aspect-[2/3] overflow-hidden rounded-xl border bg-[#0a0a0a] transition-all duration-300 ${item.current ? "border-[#E8D2A6] shadow-[0_0_28px_rgba(232,210,166,0.12)]" : item.available ? "border-white/10 group-hover:-translate-y-1 group-hover:border-[#E8D2A6]/55" : "border-white/5 opacity-45"}`}>
                                            <img
                                                src={item.poster_url || POSTER_FALLBACK}
                                                alt={item.title}
                                                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                                                className="h-full w-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/10" />
                                            <span className={`absolute left-2.5 top-2.5 flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-bold backdrop-blur-md ${item.current ? "border-[#E8D2A6] bg-[#E8D2A6] text-black" : "border-white/15 bg-black/65 text-white"}`}>
                                                {item.position || index + 1}
                                            </span>
                                            {item.current && (
                                                <span className="absolute bottom-2.5 left-2.5 rounded-full bg-[#E8D2A6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-black">Vous êtes ici</span>
                                            )}
                                            {!item.available && (
                                                <span className="absolute bottom-2.5 left-2.5 rounded-full border border-white/15 bg-black/75 px-2.5 py-1 text-[10px] uppercase tracking-wide text-neutral-400">Indisponible</span>
                                            )}
                                        </div>
                                        <div className="mt-3 min-w-0">
                                            <div className={`truncate text-sm font-medium transition-colors ${item.current ? "text-[#E8D2A6]" : item.available ? "text-white group-hover:text-[#E8D2A6]" : "text-neutral-600"}`}>{item.title}</div>
                                            <div className="mt-1 text-xs text-neutral-600">{item.year || "Année inconnue"} · {item.type === "movie" ? "Film" : item.type === "series" ? "Série" : "Anime"}</div>
                                        </div>
                                    </CardTag>
                                    {index < timeline.items.length - 1 && (
                                        <div className="mt-[104px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#262626] bg-[#0a0a0a] text-[#E8D2A6] sm:mt-[126px]" aria-hidden="true">
                                            <ArrowRight size={14} />
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </HScroller> : (
                        <div className="rounded-xl border border-white/10 bg-[#0a0a0a] px-5 py-8 text-sm text-neutral-500">
                            La chronologie de ce titre n’est pas encore disponible.
                        </div>
                    )}
                </section>
            )}

            {activeTab === "similar" && similar.length > 0 && (
                <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-white/5" data-testid="similar-section">
                    <div className="mb-6">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[#E8D2A6] mb-1">Vous aimerez aussi</div>
                        <h2 className="font-display text-3xl tracking-tight">Titres similaires</h2>
                    </div>
                    <HScroller
                        testId="similar-media-scroller"
                        itemClassName="flex gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth -mx-6 px-8 pt-2 pb-3 sm:px-9 [scroll-padding-inline:2rem]"
                    >
                        {similar.map((m) => (
                            <MediaCard key={m.id} media={m} size="sm" />
                        ))}
                    </HScroller>
                </section>
            )}

            {activeTab === "reviews" && (
            <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 border-t border-white/5" data-testid="reviews-section">
                <div className="mb-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[#E8D2A6] mb-1">La communauté</div>
                    <h2 className="font-display text-3xl tracking-tight">Avis & notes</h2>
                </div>
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
            )}
        </div>
    );
}
