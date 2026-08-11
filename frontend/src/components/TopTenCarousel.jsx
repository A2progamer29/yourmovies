import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Film, Star, TrendingUp } from "lucide-react";
import HScroller from "@/components/HScroller";

function TopTenItem({ media, rank }) {
  const [imgOk, setImgOk] = useState(true);
  const typeLabel =
    media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime";
  const rating = Number(media.rating);

  return (
    <Link
      to={`/media/${media.id}`}
      data-testid={`top10-${rank}`}
      aria-label={`${rank}. ${media.title}`}
      className="group shrink-0 snap-start select-none rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] focus-visible:ring-offset-4 focus-visible:ring-offset-[#050505]"
    >
      <div className="flex items-end">
        {/* Le rang reste hors de l'affiche : elle garde son format et sa lisibilité. */}
        <span
          aria-hidden="true"
          className="pointer-events-none -mr-5 font-display leading-[0.75] text-[7rem] tracking-tighter text-[#131313] transition-colors duration-300 group-hover:text-[#1c1710] sm:-mr-7 sm:text-[9rem]"
          style={{ WebkitTextStroke: "1px rgba(232,210,166,0.35)" }}
        >
          {rank}
        </span>

        <div className="relative w-32 shrink-0 overflow-hidden rounded-xl border border-[#1f1f1f] bg-gradient-to-br from-[#161616] to-[#0a0a0a] shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-[transform,border-color] duration-300 group-hover:-translate-y-1.5 group-hover:border-[#E8D2A6]/50 sm:w-40">
          <div className="aspect-[2/3]">
            <div className="absolute inset-0 flex items-center justify-center">
              <Film size={26} className="text-[#E8D2A6]/25" />
            </div>
            {media.poster_url && imgOk && (
              <img
                src={media.poster_url}
                alt=""
                loading="lazy"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setImgOk(false)}
              />
            )}
          </div>

          {Number.isFinite(rating) && rating > 0 && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
              <Star size={10} fill="#E8D2A6" className="text-[#E8D2A6]" />
              {rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 w-32 sm:w-40">
        <h3 className="truncate text-sm font-medium text-white transition-colors group-hover:text-[#E8D2A6]">
          {media.title}
        </h3>
        <p className="mt-0.5 truncate text-xs text-neutral-500">
          <span className="text-[#E8D2A6]/80">{typeLabel}</span>
          {media.year ? ` · ${media.year}` : ""}
        </p>
      </div>
    </Link>
  );
}

export default function TopTenCarousel({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mx-auto mt-16 max-w-7xl px-6" data-testid="top10-section">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-500">
          <TrendingUp size={13} className="text-[#E8D2A6]" />
          Sur la plateforme
        </div>
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
          Top 10 le plus regardé
        </h2>
      </div>

      <HScroller
        testId="carousel-top10"
        itemClassName="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth -mx-6 px-8 pt-2 pb-3 sm:gap-5 sm:px-9 [scroll-padding-inline:2rem]"
      >
        {items.slice(0, 10).map((media, index) => (
          <TopTenItem key={media.id} media={media} rank={index + 1} />
        ))}
      </HScroller>
    </section>
  );
}
