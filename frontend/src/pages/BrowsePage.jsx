import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Filter, X, Sparkles, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";
import Header from "@/components/Header";
import MediaCard from "@/components/MediaCard";
import AdBanner from "@/components/AdBanner";

const TYPES = [
    { key: "", label: "Tout" },
    { key: "movie", label: "Films" },
    { key: "series", label: "Séries" },
    { key: "anime", label: "Animes" },
];

export default function BrowsePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const type = searchParams.get("type") || "";
    const [items, setItems] = useState([]);
    const [q, setQ] = useState(searchParams.get("q") || "");
    const [genre, setGenre] = useState(searchParams.get("genre") || "");
    const [year, setYear] = useState(searchParams.get("year") || "");
    const [minRating, setMinRating] = useState(Number(searchParams.get("minRating") || 0));

    useEffect(() => {
        (async () => {
            const params = new URLSearchParams();
            if (type) params.set("type", type);
            if (q) params.set("q", q);
            const res = await api.get(`/media?${params.toString()}&limit=200`);
            setItems(res.data);
        })();
    }, [type, q]);

    const allGenres = useMemo(() => {
        const s = new Set();
        items.forEach((m) => (m.genres || []).forEach((g) => s.add(g)));
        return Array.from(s).sort();
    }, [items]);
    const allYears = useMemo(() => {
        const s = new Set(items.map((m) => m.year).filter(Boolean));
        return Array.from(s).sort((a, b) => b - a);
    }, [items]);

    const filtered = items.filter((m) => {
        if (genre && !(m.genres || []).includes(genre)) return false;
        if (year && String(m.year) !== String(year)) return false;
        if (minRating > 0 && (m.rating || 0) < minRating) return false;
        return true;
    });

    const setType = (t) => {
        const next = new URLSearchParams(searchParams);
        if (t) next.set("type", t); else next.delete("type");
        setSearchParams(next);
    };

    const clearAll = () => {
        setQ(""); setGenre(""); setYear(""); setMinRating(0);
        setSearchParams(new URLSearchParams());
    };

    const hasFilters = q || genre || year || minRating > 0 || type;

    return (
        <div className="min-h-screen bg-[#050505]">
            <div className="noise-overlay" />
            <Header />
            <div className="max-w-7xl mx-auto px-6 py-12">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Catalogue</div>
                        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">Explorer</h1>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <Input
                            data-testid="browse-search-input"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Rechercher un titre..."
                            className="pl-9 bg-[#111111] border-[#262626] text-white placeholder:text-neutral-600 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-6 items-center">
                    <Filter size={14} className="text-neutral-500 mr-1" />
                    {TYPES.map((t) => (
                        <button
                            key={t.key || "all"}
                            data-testid={`filter-${t.key || "all"}`}
                            onClick={() => setType(t.key)}
                            className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${(type === t.key)
                                ? "bg-[#E8D2A6] text-black border-[#E8D2A6]"
                                : "border-[#262626] text-neutral-300 hover:border-[#E8D2A6]/50 hover:text-white"
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="grid md:grid-cols-3 gap-4 mb-8">
                    <div>
                        <label className="text-xs uppercase tracking-widest text-neutral-500 mb-2 block">Genre</label>
                        <select
                            data-testid="filter-genre"
                            value={genre}
                            onChange={(e) => setGenre(e.target.value)}
                            className="w-full h-10 bg-[#111] border border-[#262626] rounded-md text-white px-3 focus:border-[#E8D2A6] focus:outline-none"
                        >
                            <option value="">Tous les genres</option>
                            {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs uppercase tracking-widest text-neutral-500 mb-2 block">Année</label>
                        <select
                            data-testid="filter-year"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            className="w-full h-10 bg-[#111] border border-[#262626] rounded-md text-white px-3 focus:border-[#E8D2A6] focus:outline-none"
                        >
                            <option value="">Toutes les années</option>
                            {allYears.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs uppercase tracking-widest text-neutral-500 mb-2 block flex items-center justify-between">
                            <span>Note min.</span>
                            <span className="text-[#E8D2A6]">{minRating.toFixed(1)}</span>
                        </label>
                        <Slider
                            data-testid="filter-rating"
                            value={[minRating]}
                            min={0}
                            max={10}
                            step={0.5}
                            onValueChange={(v) => setMinRating(v[0])}
                            className="mt-3"
                        />
                    </div>
                </div>

                {hasFilters && (
                    <button
                        onClick={clearAll}
                        data-testid="clear-filters-btn"
                        className="mb-6 inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-[#E8D2A6]"
                    >
                        <X size={12} /> Effacer les filtres
                    </button>
                )}

                {filtered.length === 0 ? (
                    <div className="mx-auto max-w-xl rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-b from-[#171208] to-[#0a0a0a] px-6 py-12 text-center">
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8D2A6] text-black">
                            <Sparkles size={24} />
                        </div>
                        <h2 className="font-display text-2xl tracking-tight text-white">Aucun résultat</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-400">
                            Le site est encore en <span className="text-[#E8D2A6]">développement</span> et le catalogue
                            s&apos;étoffe chaque semaine. Ce titre n&apos;y est pas encore ? Propose-le sur le Wishboard :
                            les demandes les plus votées sont ajoutées en priorité.
                        </p>
                        <Link
                            to="/wishboard"
                            data-testid="browse-empty-wishboard"
                            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#E8D2A6] px-6 font-semibold text-black transition-colors hover:bg-[#D4BB8B]"
                        >
                            Proposer ce titre <ArrowRight size={16} />
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {filtered.map((m) => (
                                <MediaCard key={m.id} media={m} size="sm" />
                            ))}
                        </div>

                        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#262626] bg-[#0a0a0a] px-6 py-5">
                            <p className="text-sm text-neutral-400">
                                <span className="text-white">Le catalogue s&apos;agrandit chaque semaine.</span>{" "}
                                Un titre manque à l&apos;appel ? Propose-le, on l&apos;ajoute selon les votes.
                            </p>
                            <Link
                                to="/wishboard"
                                data-testid="browse-wishboard-cta"
                                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[#E8D2A6]/40 px-5 text-sm font-semibold text-[#E8D2A6] transition-colors hover:bg-[#E8D2A6] hover:text-black"
                            >
                                Aller au Wishboard <ArrowRight size={15} />
                            </Link>
                        </div>
                    </>
                )}
            </div>
            <AdBanner className="!mt-0 pb-12" />
        </div>
    );
}
