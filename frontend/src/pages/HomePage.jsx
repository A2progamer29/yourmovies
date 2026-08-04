import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, Info, Sparkles, Crown, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import MediaCarousel from "@/components/MediaCarousel";

const HERO_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";
const AUTO_ROTATE_MS = 7000;

export default function HomePage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [featured, setFeatured] = useState([]);
    const [heroIndex, setHeroIndex] = useState(0);
    const [movies, setMovies] = useState([]);
    const [series, setSeries] = useState([]);
    const [animes, setAnimes] = useState([]);
    const [latest, setLatest] = useState([]);
    const [continueWatching, setContinueWatching] = useState([]);
    const rotateTimer = useRef(null);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [all, mv, sr, an, feat] = await Promise.all([
                    api.get("/media?limit=30"),
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
            if (user) {
                try {
                    const cw = await api.get("/watch-progress");
                    setContinueWatching(cw.data);
                } catch (e) { }
            }
        })();
    }, [user]);

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
                                    className="max-h-40 sm:max-h-52 lg:max-h-64 w-auto object-contain drop-shadow-2xl"
                                    data-testid="hero-title-logo"
                                />
                            ) : (
                                <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl tracking-tighter leading-none font-light text-white">
                                    {current?.title || "Votre catalogue"}
                                </h1>
                            )}
                            {current?.genres?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-5">
                                    {current.genres.slice(0, 4).map((g) => (
                                        <span key={g} className="text-xs uppercase tracking-wider px-3 py-1 rounded-full border border-[#E8D2A6]/30 text-[#E8D2A6]">{g}</span>
                                    ))}
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

            {continueWatching.length > 0 && (
                <section className="max-w-7xl mx-auto px-6 mt-16">
                    <div className="flex items-end justify-between mb-6">
                        <div>
                            <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Pour vous</div>
                            <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Reprendre</h2>
                        </div>
                    </div>
                    <div className="flex gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-6 px-6">
                        {continueWatching.map((m) => (
                            <div key={m.id} className="shrink-0 w-64 snap-start">
                                <Link to={`/media/${m.id}`} data-testid={`resume-${m.id}`} className="block relative aspect-video rounded-lg overflow-hidden border border-[#262626] hover:border-[#E8D2A6]/40 transition-colors bg-[#111]">
                                    <img src={m.banner_url || m.poster_url} alt={m.title} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent" />
                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                        <div className="text-white text-sm font-medium truncate">{m.title}</div>
                                        {m.duration_seconds && (
                                            <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#E8D2A6]" style={{ width: `${Math.min(100, (m.position_seconds / m.duration_seconds) * 100)}%` }} />
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            </div>
                        ))}
                    </div>
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
                    <MediaCarousel title="Nouveautés" items={latest} seeAllHref="/browse" testId="carousel-latest" />
                    {movies.length > 0 && <MediaCarousel title="Films" items={movies} seeAllHref="/browse?type=movie" testId="carousel-movies" />}
                    {series.length > 0 && <MediaCarousel title="Séries" items={series} seeAllHref="/browse?type=series" testId="carousel-series" />}
                    {animes.length > 0 && <MediaCarousel title="Animes" items={animes} seeAllHref="/browse?type=anime" testId="carousel-animes" />}
                </>
            )}

            <footer className="mt-24 py-12 border-t border-[#1a1a1a] text-center text-sm text-neutral-500">
                YourMovie&apos;s — Une collection cinéma pensée pour vous.
            </footer>
        </div>
    );
}
