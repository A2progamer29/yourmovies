import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Star, Clock, Heart, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const POSTER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";

export default function MediaCard({ media, size = "md" }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [fav, setFav] = useState(null);
    const [watch, setWatch] = useState(null);
    const [busy, setBusy] = useState(false);

    const widths = {
        sm: "w-32 sm:w-36",
        md: "w-40 sm:w-48",
        lg: "w-48 sm:w-56",
    };

    const toggle = async (e, list_type) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) { navigate("/login"); return; }
        if (busy) return;
        setBusy(true);
        try {
            const r = await api.post(`/favorites/${media.id}?list_type=${list_type}`);
            const active = r.data.active;
            if (list_type === "favorite") setFav(active); else setWatch(active);
            toast.success(active ? "Ajouté" : "Retiré");
        } catch (err) {
            toast.error("Action impossible");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Link
            to={`/media/${media.id}`}
            data-testid={`media-card-${media.id}`}
            className={`poster-tile group shrink-0 ${widths[size]} snap-start focus-ring rounded-lg`}
        >
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-[#1a1a1a] group-hover:border-[#E8D2A6]/40 transition-colors bg-[#111]">
                <img
                    src={media.poster_url || POSTER_FALLBACK}
                    alt={media.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/95 via-[#050505]/10 to-transparent opacity-90" />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest bg-[#050505]/70 border border-[#262626] text-[#E8D2A6]">
                    {media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime"}
                </div>
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                        type="button"
                        aria-label="Ajouter aux favoris"
                        data-testid={`card-fav-${media.id}`}
                        onClick={(e) => toggle(e, "favorite")}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${fav ? "bg-[#E8D2A6] text-black border-[#E8D2A6]" : "bg-[#050505]/70 text-white border-[#262626] hover:border-[#E8D2A6]/60"}`}
                    >
                        <Heart size={14} fill={fav ? "currentColor" : "none"} />
                    </button>
                    <button
                        type="button"
                        aria-label="Ajouter à la watchlist"
                        data-testid={`card-watch-${media.id}`}
                        onClick={(e) => toggle(e, "watchlist")}
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
        </Link>
    );
}
