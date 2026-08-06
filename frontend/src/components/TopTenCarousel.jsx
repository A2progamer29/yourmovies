import React from "react";
import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import HScroller from "@/components/HScroller";

const POSTER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";

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
                    <Link
                        key={m.id}
                        to={`/media/${m.id}`}
                        data-testid={`top10-${i + 1}`}
                        className="shrink-0 snap-start select-none group"
                    >
                        <div className="flex items-end">
                            <span
                                className="font-display leading-[0.8] text-[88px] sm:text-[132px] text-[#0a0a0a]"
                                style={{ WebkitTextStroke: "2px #E8D2A6" }}
                            >
                                {i + 1}
                            </span>
                            <div className="w-28 sm:w-36 -ml-4 sm:-ml-6 shrink-0 aspect-[2/3] rounded-lg overflow-hidden border border-[#1a1a1a] group-hover:border-[#E8D2A6]/50 transition-colors bg-[#111]">
                                <img
                                    src={m.poster_url || POSTER_FALLBACK}
                                    alt={m.title}
                                    loading="lazy"
                                    draggable={false}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                                />
                            </div>
                        </div>
                        <div className="mt-3 pl-1 max-w-[180px]">
                            <div className="text-sm text-white font-medium truncate group-hover:text-[#E8D2A6] transition-colors">{m.title}</div>
                            <div className="text-xs text-neutral-500 mt-0.5 capitalize">
                                {m.type === "movie" ? "Film" : m.type === "series" ? "Série" : "Anime"}{m.year ? ` · ${m.year}` : ""}
                            </div>
                        </div>
                    </Link>
                ))}
            </HScroller>
        </section>
    );
}
