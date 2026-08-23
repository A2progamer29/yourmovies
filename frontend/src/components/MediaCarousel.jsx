import React from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import MediaCard from "@/components/MediaCard";
import HScroller from "@/components/HScroller";

export default function MediaCarousel({ title, eyebrow = "Catalogue", items, seeAllHref, testId, showEmpty = false, emptyMessage = "Aucun contenu pour le moment." }) {
    if ((!items || items.length === 0) && !showEmpty) return null;
    return (
        <section className="max-w-7xl mx-auto px-6 mt-16" data-testid={testId || "media-carousel"}>
            <div className="flex items-end justify-between mb-6 gap-4">
                <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">{eyebrow}</div>
                    <h2 className="font-display text-3xl sm:text-4xl tracking-tight">{title}</h2>
                </div>
                {seeAllHref && (
                    <Link
                        to={seeAllHref}
                        className="text-sm text-[#E8D2A6] hover:text-[#F5E6C5] flex items-center gap-1 transition-colors shrink-0"
                    >
                        Tout voir <ChevronRight size={14} />
                    </Link>
                )}
            </div>
            {items && items.length > 0 ? (
                <HScroller testId={testId ? `${testId}-scroller` : undefined}>
                    {items.map((m) => (
                        <MediaCard key={m.id} media={m} />
                    ))}
                </HScroller>
            ) : (
                <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] px-5 py-8 text-sm text-neutral-500">
                    {emptyMessage}
                </div>
            )}
        </section>
    );
}
