import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, Info, Sparkles, Crown, ChevronLeft, ChevronRight, Search, ArrowRight, Tag, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import HomeSkeleton from "@/components/HomeSkeleton";
import MediaCarousel from "@/components/MediaCarousel";
import TopTenCarousel from "@/components/TopTenCarousel";
import HScroller from "@/components/HScroller";
import AdBanner from "@/components/AdBanner";

const HERO_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='9'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";
const AUTO_ROTATE_MS = 7000;
const CONTINUE_WATCHING_LIMIT = 95;

function progressPercent(item) {
    const position = Number(item?.position_seconds || 0);
    const duration = Number(item?.duration_seconds || 0);
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (position / duration) * 100));
}

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
    const [removingProgressId, setRemovingProgressId] = useState(null);
    const [progressRemovalError, setProgressRemovalError] = useState("");
    const [progressLoaded, setProgressLoaded] = useState(false);
    const [chargement, setChargement] = useState(true);
    const rotateTimer = useRef(null);
    const [heroArrowSide, setHeroArrowSide] = useState(null);

    useEffect(() => {
        let annule = false;
        (async () => {
            // Tout part en même temps. Le chargement était découpé en vagues, dont
            // les trois dernières s'enchaînaient en série : chaque section
            // apparaissait l'une après l'autre, et la page semblait ramer alors
            // qu'elle attendait simplement des allers-retours successifs.
            const rien = () => null;
            const anonyme = Promise.resolve(null);
            const [feat, watchResult, all, mv, sr, an, tend, gen, reco] = await Promise.all([
                api.get("/media?featured=true&limit=10").catch(rien),
                user ? api.get("/watch-progress", { silent: true }).catch(rien) : anonyme,
                api.get("/media?limit=40").catch(rien),
                api.get("/media?type=movie&limit=20").catch(rien),
                api.get("/media?type=series&limit=20").catch(rien),
                api.get("/media?type=anime&limit=20").catch(rien),
                api.get("/trending?limit=10").catch(rien),
                api.get("/genres?limit=16").catch(rien),
                user ? api.get("/recommendations?limit=20", { silent: true }).catch(rien) : anonyme,
            ]);
            if (annule) return;

            const catalogue = Array.isArray(all?.data) ? all.data : [];
            const vedettes = Array.isArray(feat?.data) && feat.data.length > 0
                ? [...feat.data].sort((a, b) => (a.featured_order ?? 999) - (b.featured_order ?? 999))
                : catalogue.slice(0, 1);
            const enCours = (Array.isArray(watchResult?.data) ? watchResult.data : [])
                .filter((item) => progressPercent(item) < CONTINUE_WATCHING_LIMIT);

            // React regroupe ces mises à jour en un seul rendu : la page se
            // remplit d'un bloc au lieu de s'assembler morceau par morceau.
            setFeatured(vedettes);
            setContinueWatching(enCours);
            setLatest(catalogue);
            setMovies(Array.isArray(mv?.data) ? mv.data : []);
            setSeries(Array.isArray(sr?.data) ? sr.data : []);
            setAnimes(Array.isArray(an?.data) ? an.data : []);
            setTrending(Array.isArray(tend?.data) ? tend.data : []);
            setGenres(Array.isArray(gen?.data) ? gen.data : []);
            setRecommendations(enCours.length > 0 && Array.isArray(reco?.data) ? reco.data : []);
            setProgressLoaded(true);
            setChargement(false);
        })();
        return () => { annule = true; };
    }, [user, activeProfile?.id]);

    const removeFromContinueWatching = async (event, mediaId) => {
        event.preventDefault();
        event.stopPropagation();
        if (removingProgressId) return;

        const previousItems = continueWatching;
        const remainingItems = previousItems.filter((item) => item.id !== mediaId);
        setRemovingProgressId(mediaId);
        setProgressRemovalError("");
        setContinueWatching(remainingItems);

        try {
            await api.delete(`/watch-progress/${encodeURIComponent(mediaId)}`, { silent: true });

            if (remainingItems.length === 0) {
                setRecommendations([]);
            } else {
                try {
                    const recommendationResult = await api.get("/recommendations?limit=20", { silent: true });
                    setRecommendations(
                        Array.isArray(recommendationResult.data)
                            ? recommendationResult.data
                            : []
                    );
                } catch (e) {
                    setRecommendations([]);
                }
            }
        } catch (e) {
            setContinueWatching(previousItems);
            setProgressRemovalError("Impossible de retirer ce contenu pour le moment.");
        } finally {
            setRemovingProgressId(null);
        }
    };

    useEffect(() => {
        if (featured.length <= 1) return;
        rotateTimer.current = setTimeout(() => {
            setHeroIndex((i) => (i + 1) % featured.length);
        }, AUTO_ROTATE_MS);
        return () => clearTimeout(rotateTimer.current);
    }, [heroIndex, featured]);

    const updateHeroArrowVisibility = (event) => {
        if (featured.length <= 1) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const pointerRatio = (event.clientX - bounds.left) / Math.max(1, bounds.width);
        const nextSide = pointerRatio <= 0.22 ? "left" : pointerRatio >= 0.78 ? "right" : null;
        setHeroArrowSide((currentSide) => currentSide === nextSide ? currentSide : nextSide);
    };

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
    const recommendationItems = recommendations
        .filter((item, index, items) =>
            item?.id
            && !continueIds.has(item.id)
            && items.findIndex((candidate) => candidate?.id === item.id) === index
        )
        .slice(0, 20);

    if (chargement) {
        return (
            <div className="min-h-screen bg-[#050505] relative">
                <div className="noise-overlay" />
                <Header />
                <HomeSkeleton />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] relative">
            <div className="noise-overlay" />
            <Header />

            {/* HERO CAROUSEL — masqué tant qu'aucun contenu à l'affiche */}
            {current && (
            <section
                className="relative w-full h-[85vh] min-h-[560px] overflow-hidden"
                onMouseMove={updateHeroArrowVisibility}
                onMouseLeave={() => setHeroArrowSide(null)}
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
                                controls={false}
                                preload="auto"
                                disablePictureInPicture
                                controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
                                tabIndex={-1}
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover pointer-events-none"
                            />
                        ) : showTrailerAutoplay ? (
                            // Agrandi puis recadré : toute la surcouche YouTube (titre, barre de
                            // lecture, boutons) sort du cadre visible au lieu d'être affichée.
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <iframe
                                    data-testid="hero-trailer-autoplay"
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-150 w-[177.77vh] min-w-full h-[56.25vw] min-h-full pointer-events-none"
                                    src={`https://www.youtube.com/embed/${current.trailer_youtube_id}?autoplay=1&mute=1&loop=1&controls=0&modestbranding=1&showinfo=0&rel=0&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&cc_load_policy=0&color=white&vq=hd1080&hd=1&playlist=${current.trailer_youtube_id}`}
                                    title="Trailer"
                                    frameBorder="0"
                                    tabIndex={-1}
                                    allow="autoplay; encrypted-media"
                                />
                            </div>
                        ) : (
                            <img
                                src={current?.banner_url || current?.poster_url || HERO_FALLBACK}
                                alt={current?.title || "Hero"}
                                fetchpriority="high"
                                decoding="async"
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
                                    {current.title}
                                </h1>
                            )}
                            {current?.genres?.length > 0 && (
                                <div className="mt-5 text-sm uppercase tracking-wider text-[#E8D2A6]">
                                    {current.genres.slice(0, 4).join("  ·  ")}
                                </div>
                            )}
                            {current.description && (
                                <p className="mt-6 text-lg text-neutral-300 leading-relaxed max-w-xl line-clamp-3">
                                    {current.description}
                                </p>
                            )}
                            <div className="mt-8 flex flex-wrap items-center gap-3">
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
                            className={`hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/55 backdrop-blur border border-white/10 items-center justify-center text-white/80 transition-[opacity,transform,background-color,border-color] duration-200 hover:text-white hover:bg-black/80 hover:border-[#E8D2A6]/45 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] ${heroArrowSide === "left" ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-2 pointer-events-none"}`}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={() => setHeroIndex((i) => (i + 1) % featured.length)}
                            data-testid="hero-next"
                            className={`hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/55 backdrop-blur border border-white/10 items-center justify-center text-white/80 transition-[opacity,transform,background-color,border-color] duration-200 hover:text-white hover:bg-black/80 hover:border-[#E8D2A6]/45 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] ${heroArrowSide === "right" ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 translate-x-2 pointer-events-none"}`}
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
            )}

            {user && progressLoaded && (
                <section className="max-w-7xl mx-auto px-6 mt-10" data-testid="continue-watching-section">
                    <div className="mb-6">
                        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Votre historique</div>
                        <h2 className="font-display text-3xl sm:text-4xl tracking-tight">Continuer à regarder</h2>
                        {progressRemovalError && (
                            <p className="mt-2 text-sm text-red-300" role="status" aria-live="polite">
                                {progressRemovalError}
                            </p>
                        )}
                    </div>
                    {continueWatching.length > 0 ? (
                        <HScroller testId="recently-watched-scroller">
                            {continueWatching.map((m) => {
                                const episodeQuery = m.season_number != null && m.episode_number != null
                                    ? `?season=${encodeURIComponent(m.season_number)}&episode=${encodeURIComponent(m.episode_number)}`
                                    : "";
                                const progress = progressPercent(m);
                                return (
                                    <div key={m.id} className="group/card relative shrink-0 w-64 snap-start">
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
                                                <div className="h-full bg-[#E8D2A6] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
                                            </div>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={(event) => removeFromContinueWatching(event, m.id)}
                                            disabled={removingProgressId !== null}
                                            className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white/75 opacity-100 backdrop-blur-md transition-all hover:border-[#E8D2A6]/60 hover:bg-[#E8D2A6] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6] disabled:cursor-wait disabled:opacity-50 sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100"
                                            aria-label={`Retirer ${m.title} de Continuer à regarder`}
                                            title="Retirer de Continuer à regarder"
                                            data-testid={`remove-progress-${m.id}`}
                                        >
                                            <X size={15} aria-hidden="true" />
                                        </button>
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
                    eyebrow="Selon votre historique"
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
                        className="ym-shimmer block p-6 rounded-2xl border border-[#E8D2A6]/30 bg-[#0c0c0c] hover:border-[#E8D2A6]/60 transition-colors"
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

            {isEmpty ? null : (
                <>
                    <MediaCarousel title="Ajouts récents" eyebrow="Nouveautés" items={latest} seeAllHref="/browse" testId="carousel-latest" />
                    <TopTenCarousel items={trending} />

                    <section className="max-w-7xl mx-auto px-6 mt-16">
                        <Link
                            to="/wishboard"
                            data-testid="wishboard-cta"
                            className="group relative block overflow-hidden rounded-3xl border border-[#E8D2A6]/30 bg-[#0c0c0c] hover:border-[#E8D2A6]/70 transition-colors p-8 sm:p-12"
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

                    <AdBanner />
                </>
            )}

            <footer className="mt-24 py-12 border-t border-[#1a1a1a] text-center text-sm text-neutral-500">
                YourMovie&apos;s — Une collection cinéma pensée pour vous.
            </footer>
        </div>
    );
}
