import React, { useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Film } from "lucide-react";
import HScroller from "@/components/HScroller";

function TopTenItem({ media, rank }) {
    const [imgOk, setImgOk] = useState(true);
    const typeLabel = media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime";
    return (
        <Link
            to={`/media/${media.id}`}
            data-testid={`top10-${rank}`}
            className="shrink-0 snap-start select-none group w-36 sm:w-44"
        >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden border border-[#1a1a1a] group-hover:border-[#E8D2A6]/50 transition-colors bg-gradient-to-br from-[#1c1c1c] to-[#0a0a0a]">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                    <Film size={22} className="text-[#E8D2A6]/70" />
                    <span className="text-xs text-neutral-300 font-medium line-clamp-3 leading-snug">{media.title}</span>
                </div>
                {media.poster_url && imgOk && (
                    <img
                        src={media.poster_url}
                        alt={media.title}
                        loading="lazy"
                        draggable={false}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={() => setImgOk(false)}
                    />
                )}
                <span
                    className="absolute top-1 right-2.5 z-20 leading-none text-5xl sm:text-6xl"
                    style={{
                        fontFamily: "'Playfair Display', Georgia, serif",
                        color: "transparent",
                        WebkitTextFillColor: "transparent",
                        WebkitTextStroke: "1.5px #E8D2A6",
                        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.95)) drop-shadow(0 0 2px rgba(0,0,0,0.85))",
                    }}
                >
                    {rank}
                </span>
            </div>
            <div className="mt-3 pl-0.5 max-w-[190px]">
                <div className="text-sm text-white font-medium truncate group-hover:text-[#E8D2A6] transition-colors">{media.title}</div>
                <div className="text-xs text-neutral-500 mt-0.5">
                    {typeLabel}{media.year ? ` · ${media.year}` : ""}
                </div>
            </div>
        </Link>
    );
}

export default function TopTenCarousel({ items }) {
    if (!items || items.length === 0) return null;
    return (
        <section className="max-w-7xl mx-auto px-6 mt-16">
            <div className="mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-2">
                    <TrendingUp size={13} className="text-[#E8D2A6]" /> Sur la plateforme
                </div>
                <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Top 10 le plus regardé</h2>
            </div>
            <HScroller testId="carousel-top10">
                {items.slice(0, 10).map((m, i) => (
                    <TopTenItem key={m.id} media={m} rank={i + 1} />
                ))}
            </HScroller>
        </section>
    );
}
