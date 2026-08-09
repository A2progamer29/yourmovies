import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Film, Star, TrendingUp } from "lucide-react";
import HScroller from "@/components/HScroller";

function TopTenItem({ media, rank }) {
  const [imgOk, setImgOk] = useState(true);
  const typeLabel =
    media.type === "movie"
      ? "Film"
      : media.type === "series"
        ? "Série"
        : "Anime";
  const rating = Number(media.rating);

  return (
    <Link
      to={`/media/${media.id}`}
      data-testid={`top10-${rank}`}
      aria-label={`${rank}. ${media.title}`}
      className="group block w-[17.5rem] shrink-0 snap-start select-none rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] focus-visible:ring-offset-4 focus-visible:ring-offset-[#050505] sm:w-80"
    >
      <article className="relative h-52 overflow-hidden rounded-2xl border border-[#202020] bg-[#0a0a0a] transition-[transform,border-color,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:border-[#E8D2A6]/45 group-hover:shadow-[0_18px_45px_rgba(0,0,0,0.45)] sm:h-56">
        <div className="absolute inset-y-0 right-0 w-[68%] bg-gradient-to-br from-[#171717] to-[#080808]">
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={28} className="text-[#E8D2A6]/30" />
          </div>
          {media.poster_url && imgOk && (
            <img
              src={media.poster_url}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              onError={() => setImgOk(false)}
            />
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/95 via-[45%] to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-black/15" />
        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[#E8D2A6]/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-6 font-display text-[6.4rem] leading-none tracking-tighter opacity-65 transition-[opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:opacity-90 sm:left-4 sm:text-[7.2rem]"
          style={{
            color: "transparent",
            WebkitTextFillColor: "transparent",
            WebkitTextStroke: "1.5px rgba(232, 210, 166, 0.9)",
            filter: "drop-shadow(0 5px 16px rgba(0, 0, 0, 0.75))",
          }}
        >
          {String(rank).padStart(2, "0")}
        </span>

        <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5">
          <div className="mb-2 h-px w-8 bg-[#E8D2A6]/70 transition-all duration-300 group-hover:w-12" />
          <h3 className="max-w-[72%] text-base font-semibold leading-tight text-white transition-colors group-hover:text-[#F5E6C5] sm:text-lg">
            <span className="line-clamp-2">{media.title}</span>
          </h3>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-400">
            <span className="uppercase tracking-[0.16em] text-[#E8D2A6]">
              {typeLabel}
            </span>
            {media.year && (
              <>
                <span className="h-1 w-1 rounded-full bg-neutral-700" />
                <span>{media.year}</span>
              </>
            )}
            {Number.isFinite(rating) && rating > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-neutral-700" />
                <span className="flex items-center gap-1 text-neutral-300">
                  <Star size={10} fill="#E8D2A6" className="text-[#E8D2A6]" />
                  {rating.toFixed(1)}
                </span>
              </>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function TopTenCarousel({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <section
      className="mx-auto mt-16 max-w-7xl px-6"
      data-testid="top10-section"
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-500">
            <TrendingUp size={13} className="text-[#E8D2A6]" />
            Sur la plateforme
          </div>
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Top 10 le plus regardé
          </h2>
        </div>
        <div className="hidden items-center gap-2 text-xs text-neutral-500 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E8D2A6]" />
          Classement actuel
        </div>
      </div>

      <HScroller
        testId="carousel-top10"
        itemClassName="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-3 -mx-6 px-6"
      >
        {items.slice(0, 10).map((media, index) => (
          <TopTenItem key={media.id} media={media} rank={index + 1} />
        ))}
      </HScroller>
    </section>
  );
}
