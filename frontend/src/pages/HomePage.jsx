import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, Info, Sparkles, Crown, ChevronLeft, ChevronRight, Search, ArrowRight, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import MediaCarousel from "@/components/MediaCarousel";
import TopTenCarousel from "@/components/TopTenCarousel";
import HScroller from "@/components/HScroller";

const HERO_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";
const AUTO_ROTATE_MS = 7000;

function seasonTitle(month) {
    if (month <= 1 || month === 11) return "Tendances de l'hiver";
    if (month <= 4) return "Tendances du printemps";
    if (month <= 7) return "Tendances de l'été";
    return "Tendances de l'automne";
}

export default function HomePage() {
    const navigate = useNavigate();
    const { user, activeProfile } = useAuth();
    const [featured, setFeatured] = useState([]);
    const [heroIndex, setHeroIndex] = useState(0);
    const [movies, setMovies] = useState([]);
    const [series, setSeries] = useState([]);
    const [animes, setAnimes] = useState([]);
    const [latest, setLatest] = useState([]);
    const [trending, setTrending] = useState([]);
    const [genres, setGenres] = useState([]);
    const [continueWatching, setContinueWatching] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const rotateTimer = useRef(null);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [all, mv, sr, an, feat] = await Promise.all([
                    api.get("/media?limit=40"),
                    api.get("/media?type=movie&limit=20"),
                    api.get("/media?type=series&limit=20"),
                    api.get("/media?type=anime&limit=20"),
                    api.get("/media?featured=true&limit=10"),
                ]);
                setLatest(all.data);
                setMovies(mv.data);
                setSeries(sr.data);
                setAnimes(an.data);
                const feats = (feat.data && feat.data.length > 0 ? feat.data : (all.data.slice(0, 1)));
                feats.sort((a, b) => (a.featured_order ?? 999) - (b.featured_order ?? 999));
                setFeatured(feats);
            } catch (e) { }
            try { const t = await api.get("/trending?limit=10"); setTrending(t.data); } catch (e) { }
            try { const g = await api.get("/genres?limit=16"); setGenres(g.data); } catch (e) { }
            if (user) {
                const [watchResult, recommendationResult] = await Promise.allSettled([
                    api.get("/watch-progress", { silent: true }),
                    api.get("/recommendations?limit=20", { silent: true }),
                ]);
                setContinueWatching(
                    watchResult.status === "fulfilled" && Array.isArray(watchResult.value.data)
                        ? watchResult.value.data
                        : []
                );
                setRecommendations(
                    recommendationResult.status === "fulfilled" && Array.isArray(recommendationResult.value.data)
                        ? recommendationResult.value.data
                        : []
                );
            } else {
                setContinueWatching([]);
                setRecommendations([]);
            }
        })();
    }, [user, activeProfile?.id]);

    useEffect(() => {
        if (featured.length <= 1 || paused) return;
        rotateTimer.current = setTimeout(() => {
            setHeroIndex((i) => (i + 1) % featured.length);
        }, AUTO_ROTATE_MS);
        return () => clearTimeout(rotateTimer.current);
    }, [heroIndex, featured, paused]);

    const isEmpty = latest.length === 0;
    const current = featured[heroIndex];
    const heroTrailerActive = user?.premium && user?.autoplay_hero !== false;
    const showTrailerVideo = heroTrailerActive && current?.trailer_video_url;
    const showTrailerAutoplay = heroTrailerActive && !current?.trailer_video_url && current?.trailer_youtube_id;

    const now = new Date();
    const currentYear = now.getFullYear();
    const seasonCandidates = latest.filter((m) => m.year === currentYear);
    const seasonItems = (seasonCandidates.length >= 6 ? seasonCandidates : latest).slice(0, 15);
    const continueIds = new Set(continueWatching.map((item) => item.id));
    const recommendationSource = recommendations.length > 0
        ? recommendations
        : [...trending, ...latest];
    const recommendationItems = recommendationSource
        .filter((item, index, items) =>
            item?.id
            && !continueIds.has(item.id)
            && items.findIndex((candidate) => candidate?.id === item.id) === index
        )
        .slice(0, 20);

    return (
        <div className="min-h-screen bg-[#050505] relative">
            <div className="noise-overlay" />
            <Header />

            {/* HERO CAROUSEL */}
            <section
                className="relative w-full h-[85vh] min-h-[560px] overflow-hidden"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
            >
                <AnimatePresence mode="wait">
                    <motion.div
                        key={current?.id || "empty"}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        className="absolute inset-0"
                    >
                        {showTrailerVideo ? (
                            <video
                                data-testid="hero-trailer-video"
                                src={current.trailer_video_url}
                                autoPlay muted loop playsInline
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover pointer-events-none"
                            />
                        ) : showTrailerAutoplay ? (
                            <iframe
                                data-testid="hero-trailer-autoplay"
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-125 w-[177.77vh] min-w-full h-[56.25vw] min-h-full pointer-events-none"
                                src={`https://www.youtube.com/embed/${current.trailer_youtube_id}?autoplay=1&mute=1&loop=1&controls=0&modestbranding=1&showinfo=0&rel=0&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&playlist=${current.trailer_youtube_id}`}
                                title="Trailer"
                                frameBorder="0"
                                allow="autoplay; encrypted-media"
                            />
                        ) : (
                            <img
                                src={current?.banner_url || current?.poster_url || HERO_FALLBACK}
                                alt={current?.title || "Hero"}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = HERO_FALLBACK; }}
                            />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/80 via-[#050505]/20 to-transparent" />
                    </motion.div>
                </AnimatePresence>

                <div className="relative z-10 max-w-7xl mx-auto h-full px-6 flex flex-col justify-end pb-24">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={current?.id || "empty-content"}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.6 }}
                            className="max-w-2xl"
                        >
                            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#E8D2A6] mb-4">
                                <Sparkles size={14} />
                                <span>À l&apos;affiche</span>
                                {showTrailerAutoplay && (
                                    <span className="flex items-center gap-1 ml-2 text-[10px] bg-[#E8D2A6]/10 border border-[#E8D2A6]/30 px-2 py-0.5 rounded-full">
                                        <Crown size={10} /> Cinéma Premium
                                    </span>
                                )}
                            </div>
                            {current?.title_logo_url ? (
                                <img
                                    src={current.title_logo_url}
                                    alt={current.title}
                                    className="w-64 sm:w-72 lg:w-80 h-24 sm:h-28 lg:h-32 object-contain object-left drop-shadow-2xl"
                                    data-testid="hero-title-logo"
                                />
                            ) : (
                                <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tighter leading-none font-light text-white">
                                    {current?.title || "Votre catalogue"}
                                </h1>
                            )}
                            {current?.genres?.length > 0 && (
                                <div className="mt-5 text-sm uppercase tracking-wider text-[#E8D2A6]">
                                    {current.genres.slice(0, 4).join("  ·  ")}
                                </div>
                            )}
                            <p className="mt-6 text-lg text-neutral-300 leading-relaxed max-w-xl line-clamp-3">
                                {current?.description || "Films, séries et animes — avec toutes les fiches, saisons, épisodes et bandes-annonces."}
                            </p>
                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                {current ? (
                                    <>
                                        <Button
                                            onClick={() => navigate(`/watch/${current.id}`)}
                                            data-testid="hero-watch-btn"
                                            className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-12 px-6"
                                        >
                                            <Play size={16} className="mr-2" fill="currentColor" /> Regarder
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => navigate(`/media/${current.id}`)}
                                            data-testid="hero-info-btn"
                                            className="border-[#262626] text-white hover:border-[#E8D2A6]/50 hover:bg-white/5 rounded-full h-12 px-6 bg-transparent"
                                        >
                                            <Info size={16} className="mr-2" /> Plus d&apos;infos
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        onClick={() => navigate("/browse")}
                                        data-testid="hero-browse-btn"
                                        className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-12 px-6"
                                    >
                                        Explorer le catalogue
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Hero navigation dots + arrows */}
                {featured.length > 1 && (
                    <>
                        <button
                            onClick={() => setHeroIndex((i) => (i - 1 + featured.length) % featured.length)}
                            data-testid="hero-prev"
                            className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/40 backdrop-blur border border-white/10 items-center justify-center text-white/70 hover:text-white hover:bg-black/60"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={() => setHeroIndex((i) => (i + 1) % featured.length)}
                            data-testid="hero-next"
                            className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/40 backdrop-blur border border-white/10 items-center justify-center text-white/70 hover:text-white hover:bg-black/60"
                        >
                            <ChevronRight size={18} />
                        </button>
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex gap-2">
                            {featured.map((f, i) => (
                                <button
                                    key={f.id}
                                    onClick={() => setHeroIndex(i)}
                                    data-testid={`hero-dot-${i}`}
                                    className={`h-1.5 rounded-full transition-all ${i === heroIndex ? "w-10 bg-[#E8D2A6]" : "w-4 bg-white/25 hover:bg-white/50"}`}
                                    aria-label={`Aller au slide ${i + 1}`}
                                />
                            ))}
                        </div>
                    </>
                )}
            </section>

            {user && (
                <section className="max-w-7xl mx-auto px-6 mt-10" data-testid="continue-watching-section">
                    <div className="mb-6">
                        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Votre historique</div>
                        <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Continuer à regarder</h2>
                    </div>
                    {continueWatching.length > 0 ? (
                        <HScroller testId="recently-watched-scroller">
                            {continueWatching.map((m) => {
                                const episodeQuery = m.season_number != null && m.episode_number != null
                                    ? `?season=${encodeURIComponent(m.season_number)}&episode=${encodeURIComponent(m.episode_number)}`
                                    : "";
                                const progress = m.duration_seconds > 0
                                    ? Math.min(100, Math.max(0, (m.position_seconds / m.duration_seconds) * 100))
                                    : 0;
                                return (
                                    <div key={m.id} className="shrink-0 w-64 snap-start">
                                        <Link to={`/watch/${m.id}${episodeQuery}`} data-testid={`resume-${m.id}`} className="group block relative aspect-video rounded-xl overflow-hidden border border-[#262626] hover:border-[#E8D2A6]/60 transition-colors bg-[#111]">
                                            <img src={m.banner_url || m.poster_url} alt={m.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                                            <div className="absolute bottom-0 left-0 right-0 p-3 pb-4">
                                                <div className="text-white text-sm font-medium truncate">{m.title}</div>
                                                {m.season_number != null && m.episode_number != null && (
                                                    <div className="mt-0.5 text-[11px] text-neutral-300">S{m.season_number} · E{m.episode_number}</div>
                                                )}
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                                                <div className="h-full bg-[#E8D2A6] transition-[width]" style={{ width: `${progress}%` }} />
                                            </div>
                                        </Link>
                                    </div>
                                );
                            })}
                        </HScroller>
                    ) : (
                        <Link
                            to="/browse"
                            className="group flex min-h-28 items-center justify-between gap-5 rounded-2xl border border-[#262626] bg-[#0a0a0a] px-6 py-5 transition-colors hover:border-[#E8D2A6]/50"
                            data-testid="continue-watching-empty"
                        >
                            <div>
                                <div className="font-display text-xl text-white">Aucun visionnage à reprendre</div>
                                <div className="mt-1 text-sm text-neutral-500">Lancez un film ou un épisode : il apparaîtra ensuite ici.</div>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-[#E8D2A6]">Explorer →</span>
                        </Link>
                    )}
                </section>
            )}

            {user && recommendationItems.length > 0 && (
                <MediaCarousel
                    title="Recommandations"
                    eyebrow={continueWatching.length > 0 ? "Selon votre historique" : "À découvrir"}
                    items={recommendationItems}
                    seeAllHref="/browse"
                    testId="carousel-recommendations"
                />
            )}

            {!user?.premium && (
                <section className="max-w-7xl mx-auto px-6 mt-14">
                    <Link
                        to="/pricing"
                        data-testid="premium-banner"
                        className="block p-6 rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-r from-[#171208] to-[#0a0a0a] hover:border-[#E8D2A6]/60 transition-colors"
                    >
                        <div className="flex items-center justify-between gap-6 flex-wrap">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center">
                                    <Crown size={20} />
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-[#E8D2A6]">Passez Premium</div>
                                    <div className="font-display text-xl mt-1">Regardez sans pub, en 4K, sur 4 écrans + multi-profils</div>
                                </div>
                            </div>
                            <div className="text-[#E8D2A6] font-semibold">Voir les plans →</div>
                        </div>
                    </Link>
                </section>
            )}

            {isEmpty ? (
                <section className="max-w-3xl mx-auto text-center py-24 px-6">
                    <h2 className="font-display text-3xl mb-3">Le catalogue est vide</h2>
                    <p className="text-neutral-400">
                        Connectez-vous en tant qu&apos;admin pour ajouter vos premiers films, séries ou animes depuis le panneau admin.
                    </p>
                    <Link
                        to="/login"
                        className="inline-block mt-6 px-6 py-3 rounded-full bg-[#E8D2A6] text-black font-semibold"
                        data-testid="empty-login-btn"
                    >
                        Aller à la connexion
                    </Link>
                </section>
            ) : (
                <>
                    <MediaCarousel title="Ajouts récents" eyebrow="Nouveautés" items={latest} seeAllHref="/browse" testId="carousel-latest" />
                    <TopTenCarousel items={trending} />

                    <section className="max-w-7xl mx-auto px-6 mt-16">
                        <Link
                            to="/wishboard"
                            data-testid="wishboard-cta"
                            className="group relative block overflow-hidden rounded-3xl border border-[#E8D2A6]/30 bg-gradient-to-r from-[#1c1509] via-[#120d05] to-[#0a0a0a] hover:border-[#E8D2A6]/70 transition-colors p-8 sm:p-12"
                        >
                            <div className="pointer-events-none absolute -right-16 -top-16 w-56 h-56 rounded-full bg-[#E8D2A6]/10 blur-3xl" />
                            <div className="relative flex items-center justify-between gap-6 flex-wrap">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-2xl bg-[#E8D2A6] text-black flex items-center justify-center shrink-0">
                                        <Search size={28} />
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-1.5">Wishboard</div>
                                        <div className="font-display text-2xl sm:text-4xl tracking-tight text-white leading-tight">Vous ne trouvez pas votre bonheur ?</div>
                                        <div className="text-neutral-400 mt-2 text-sm sm:text-base">Faites une demande — on ajoute vos films, séries et animes préférés au catalogue.</div>
                                    </div>
                                </div>
                                <span className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[#E8D2A6] text-black font-semibold shrink-0 group-hover:bg-[#F5E6C5] transition-colors">
                                    Faire une demande <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </span>
                            </div>
                        </Link>
                    </section>

                    {movies.length > 0 && <MediaCarousel title="Films" items={movies} seeAllHref="/browse?type=movie" testId="carousel-movies" />}
                    {series.length > 0 && <MediaCarousel title="Séries" items={series} seeAllHref="/browse?type=series" testId="carousel-series" />}

                    {genres.length > 0 && (
                        <section className="max-w-7xl mx-auto px-6 mt-16">
                            <div className="mb-6">
                                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1 flex items-center gap-2">
                                    <Tag size={13} className="text-[#E8D2A6]" /> Parcourir
                                </div>
                                <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Explorer par genre</h2>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                {genres.map((g) => (
                                    <Link
                                        key={g.genre}
                                        to={`/browse?genre=${encodeURIComponent(g.genre)}`}
                                        data-testid={`genre-${g.genre}`}
                                        className="px-6 py-3 rounded-full border border-[#262626] bg-[#0e0e0e] text-neutral-200 font-medium hover:border-[#E8D2A6] hover:text-[#E8D2A6] hover:bg-[#E8D2A6]/10 hover:-translate-y-0.5 transition-all duration-200"
                                    >
                                        {g.genre}
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {animes.length > 0 && <MediaCarousel title="Animes" items={animes} seeAllHref="/browse?type=anime" testId="carousel-animes" />}

                    {seasonItems.length > 0 && (
                        <MediaCarousel title={seasonTitle(now.getMonth())} eyebrow="Du moment" items={seasonItems} seeAllHref="/browse" testId="carousel-season" />
                    )}
                </>
            )}

            <footer className="mt-24 py-12 border-t border-[#1a1a1a] text-center text-sm text-neutral-500">
                YourMovie&apos;s — Une collection cinéma pensée pour vous.
            </footer>
        </div>
    );
}
