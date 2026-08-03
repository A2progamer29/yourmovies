import React from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import MediaCard from "@/components/MediaCard";

export default function MediaCarousel({ title, items, seeAllHref, testId }) {
    if (!items || items.length === 0) return null;
    return (
        <section className="max-w-7xl mx-auto px-6 mt-16" data-testid={testId || "media-carousel"}>
            <div className="flex items-end justify-between mb-6">
                <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Catalogue</div>
                    <h2 className="font-display text-3xl sm:text-4xl tracking-tight">{title}</h2>
                </div>
                {seeAllHref && (
                    <Link
                        to={seeAllHref}
                        className="text-sm text-[#E8D2A6] hover:text-[#F5E6C5] flex items-center gap-1 transition-colors"
                    >
                        Tout voir <ChevronRight size={14} />
                    </Link>
                )}
            </div>
            <div className="flex gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-6 px-6">
                {items.map((m) => (
                    <MediaCard key={m.id} media={m} />
                ))}
            </div>
        </section>
    );
}
