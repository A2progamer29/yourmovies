import React, { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Star, Clock, Heart, Bookmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFavorites } from "@/context/FavoritesContext";

const POSTER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";

export default function MediaCard({ media, size = "md", cinematicHover = false }) {
    const { user } = useAuth();
    const { favIds, watchIds, setStatus } = useFavorites();
    const navigate = useNavigate();
    const fav = favIds.has(media.id);
    const watch = watchIds.has(media.id);
    const [busy, setBusy] = useState(false);
    const [burst, setBurst] = useState(0);
    const [isTouch] = useState(() =>
        typeof window !== "undefined" && ("ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0)
    );

    const clickTimer = useRef(null);
    const pressTimer = useRef(null);
    const suppressClick = useRef(false);

    const widths = {
        sm: "w-32 sm:w-36",
        md: "w-40 sm:w-48",
        lg: "w-48 sm:w-56",
    };

    const applyToggle = async (list_type) => {
        if (!user) { navigate("/login"); return null; }
        if (busy) return null;
        setBusy(true);
        try {
            const r = await api.post(`/favorites/${media.id}?list_type=${list_type}`);
            const active = r.data.active;
            setStatus(media.id, list_type, active);
            return active;
        } catch {
            toast.error("Action impossible");
            return null;
        } finally {
            setBusy(false);
        }
    };

    const likeGesture = async () => {
        const active = await applyToggle("favorite");
        if (active) { setBurst(Date.now()); toast.success("Ajouté aux favoris"); }
        else if (active === false) { toast.success("Retiré des favoris"); }
    };

    const watchlistGesture = async () => {
        const active = await applyToggle("watchlist");
        if (active !== null) toast.success(active ? "Ajouté à la watchlist" : "Retiré de la watchlist");
    };

    // Icon buttons (desktop / hover)
    const toggleBtn = async (e, list_type) => {
        e.preventDefault();
        e.stopPropagation();
        if (list_type === "favorite") await likeGesture(); else await watchlistGesture();
    };

    // Touch gestures: single tap → open, double tap → like (animation), long press → watchlist
    const handleClick = (e) => {
        if (!isTouch) return; // desktop: let the Link navigate normally
        e.preventDefault();
        if (suppressClick.current) { suppressClick.current = false; return; }
        if (clickTimer.current) {
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
            likeGesture();
        } else {
            clickTimer.current = setTimeout(() => {
                clickTimer.current = null;
                navigate(`/media/${media.id}`);
            }, 260);
        }
    };

    const handleTouchStart = () => {
        if (!isTouch) return;
        pressTimer.current = setTimeout(() => {
            pressTimer.current = null;
            suppressClick.current = true;
            if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
            watchlistGesture();
        }, 500);
    };

    const cancelPress = () => {
        if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
    };

    return (
        <Link
            to={`/media/${media.id}`}
            data-testid={`media-card-${media.id}`}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            onContextMenu={(e) => { if (isTouch) e.preventDefault(); }}
            style={{ WebkitTouchCallout: "none" }}
            className={`poster-tile group shrink-0 ${widths[size]} snap-start focus-ring rounded-lg select-none ${cinematicHover ? "home-cinematic-card" : ""}`}
        >
            <div className="media-card__morph">
            <div className="media-card__visual relative aspect-[2/3] overflow-hidden rounded-lg border border-[#1a1a1a] group-hover:border-[#E8D2A6]/40 transition-colors bg-[#111]">
                <img
                    src={media.poster_url || POSTER_FALLBACK}
                    alt={media.title}
                    loading="lazy"
                    draggable={false}
                    className="media-card__poster w-full h-full object-contain sm:object-cover"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                />
                {cinematicHover && (
                    <img
                        src={media.banner_url || media.poster_url || POSTER_FALLBACK}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        draggable={false}
                        className="media-card__banner absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = media.poster_url || POSTER_FALLBACK; }}
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/95 via-[#050505]/10 to-transparent opacity-90" />

                <AnimatePresence>
                    {burst > 0 && (
                        <motion.div
                            key={burst}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 0] }}
                            transition={{ duration: 0.4, times: [0, 0.45, 1] }}
                            onAnimationComplete={() => setBurst(0)}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                        >
                            <Heart size={64} fill="#E8D2A6" className="text-[#E8D2A6] drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)]" />
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest bg-[#050505]/70 border border-[#262626] text-[#E8D2A6]">
                    {media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime"}
                </div>

                {/* état favoris/watchlist visible en permanence une fois activé (utile sur mobile) */}
                <div className={`absolute top-2 right-2 flex flex-col gap-2 transition-opacity ${fav || watch ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
                    <button
                        type="button"
                        aria-label="Ajouter aux favoris"
                        data-testid={`card-fav-${media.id}`}
                        onClick={(e) => toggleBtn(e, "favorite")}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${fav ? "bg-[#E8D2A6] text-black border-[#E8D2A6]" : "bg-[#050505]/70 text-white border-[#262626] hover:border-[#E8D2A6]/60"}`}
                    >
                        <Heart size={14} fill={fav ? "currentColor" : "none"} />
                    </button>
                    <button
                        type="button"
                        aria-label="Ajouter à la watchlist"
                        data-testid={`card-watch-${media.id}`}
                        onClick={(e) => toggleBtn(e, "watchlist")}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${watch ? "bg-[#E8D2A6] text-black border-[#E8D2A6]" : "bg-[#050505]/70 text-white border-[#262626] hover:border-[#E8D2A6]/60"}`}
                    >
                        <Bookmark size={14} fill={watch ? "currentColor" : "none"} />
                    </button>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-end">
                    {media.rating && (
                        <div className="flex items-center gap-1 text-xs text-white bg-black/50 px-2 py-1 rounded-full">
                            <Star size={12} fill="#E8D2A6" className="text-[#E8D2A6]" />
                            {media.rating.toFixed(1)}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-3 px-0.5">
                <div className="text-sm text-white font-medium truncate group-hover:text-[#E8D2A6] transition-colors">
                    {media.title}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
                    <span>{media.year || "—"}</span>
                    {media.duration_minutes && (
                        <>
                            <span className="w-1 h-1 rounded-full bg-neutral-700" />
                            <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {media.duration_minutes} min
                            </span>
                        </>
                    )}
                </div>
            </div>
            </div>
        </Link>
    );
}
