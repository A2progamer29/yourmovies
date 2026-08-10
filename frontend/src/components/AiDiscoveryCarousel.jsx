import React from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Flame, Sparkles } from "lucide-react";
import HScroller from "@/components/HScroller";

const BANNER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='10'%3E%3Crect width='100%25' height='100%25' fill='%23111111'/%3E%3C/svg%3E";

function LabelIcon({ label }) {
    if (label?.includes("Nouv") || label?.includes("récent") || label?.includes("sortie")) {
        return <CalendarDays size={12} aria-hidden="true" />;
    }
    if (label?.includes("Tendance")) {
        return <Flame size={12} aria-hidden="true" />;
    }
    return <Sparkles size={12} aria-hidden="true" />;
}

export default function AiDiscoveryCarousel({ items }) {
    if (!Array.isArray(items) || items.length === 0) return null;

    return (
        <section className="max-w-7xl mx-auto px-6 mt-16" data-testid="ai-discovery-section">
            <div className="flex items-end justify-between gap-5 mb-6">
                <div className="max-w-2xl">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#E8D2A6] mb-1">
                        <Sparkles size={13} aria-hidden="true" />
                        Nouveautés & tendances
                    </div>
                    <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Le radar IA</h2>
                    <p className="mt-2 text-sm text-neutral-500">
                        Une sélection mise à jour selon les sorties récentes, les tendances du moment et les visionnages sur YourMovie&apos;s.
                    </p>
                </div>
                <span className="hidden sm:inline-flex shrink-0 items-center gap-2 rounded-full border border-[#E8D2A6]/25 bg-[#E8D2A6]/5 px-3 py-1.5 text-[11px] uppercase tracking-wider text-[#E8D2A6]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#E8D2A6] shadow-[0_0_8px_rgba(232,210,166,0.7)]" />
                    Actualisé automatiquement
                </span>
            </div>

            <HScroller testId="ai-discovery-scroller">
                {items.map((media) => (
                    <Link
                        key={media.id}
                        to={`/media/${media.id}`}
                        data-testid={`ai-discovery-${media.id}`}
                        className="group relative h-56 w-[82vw] max-w-[340px] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#202020] bg-[#111] transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-[#E8D2A6]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] sm:w-[340px]"
                    >
                        <img
                            src={media.banner_url || media.poster_url || BANNER_FALLBACK}
                            alt={media.title}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                            onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = BANNER_FALLBACK;
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/55 to-black/5" />
                        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8D2A6]/30 bg-black/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[#E8D2A6] backdrop-blur-md">
                                <LabelIcon label={media.ai_label} />
                                {media.ai_label || "Choix de l'IA"}
                            </span>
                            <span className="font-display text-2xl text-white/45">{String(media.ai_rank || "").padStart(2, "0")}</span>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-5">
                            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                                {media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime"}
                                {media.year ? ` · ${media.year}` : ""}
                            </div>
                            <h3 className="truncate font-display text-2xl text-white transition-colors group-hover:text-[#E8D2A6]">
                                {media.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-400">
                                {media.ai_reason}
                            </p>
                        </div>
                    </Link>
                ))}
            </HScroller>
        </section>
    );
}
