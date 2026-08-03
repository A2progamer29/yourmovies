import React from "react";
import { Link } from "react-router-dom";
import { Star, Clock } from "lucide-react";

const POSTER_FALLBACK = "https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=800";

export default function MediaCard({ media, size = "md" }) {
    const widths = {
        sm: "w-32 sm:w-36",
        md: "w-40 sm:w-48",
        lg: "w-48 sm:w-56",
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
                    onError={(e) => { e.currentTarget.src = POSTER_FALLBACK; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/95 via-[#050505]/10 to-transparent opacity-90" />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest bg-[#050505]/70 border border-[#262626] text-[#E8D2A6]">
                    {media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime"}
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
