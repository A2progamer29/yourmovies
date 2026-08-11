import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    Film, PlayCircle, Users, Sparkles, Coins, MessageSquare,
    CalendarClock, BookOpen, ArrowRight,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";

const FEATURES = [
    { icon: <Film size={18} />, title: "Un seul catalogue", desc: "Films, séries et animes réunis au même endroit, avec une navigation claire et des filtres qui vont droit au but." },
    { icon: <PlayCircle size={18} />, title: "Reprise de lecture", desc: "Vous reprenez exactement là où vous vous êtes arrêté, et la série enchaîne sur l'épisode suivant." },
    { icon: <Users size={18} />, title: "Watch Party", desc: "Regardez à plusieurs, en lecture synchronisée, avec un chat intégré." },
    { icon: <Sparkles size={18} />, title: "Wishboard", desc: "Proposez les titres qui vous manquent et votez : les plus demandés sont ajoutés en priorité." },
    { icon: <Coins size={18} />, title: "Freemium", desc: "Une monnaie gagnée en participant, échangeable contre du Premium — sans dépenser un centime." },
    { icon: <MessageSquare size={18} />, title: "Communauté", desc: "Avis, discussions, messagerie et profils publics pour partager ce que vous regardez." },
];

export default function AboutPage() {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        let active = true;
        api.get("/public/stats", { silent: true })
            .then((response) => { if (active) setStats(response.data); })
            .catch(() => { if (active) setStats(null); });
        return () => { active = false; };
    }, []);

    const cards = useMemo(() => ([
        { label: "Contenus", value: stats?.contents },
        { label: "Utilisateurs", value: stats?.users },
        { label: "Commentaires", value: stats?.comments },
        { label: "Abonnés", value: stats?.subscribers },
    ]), [stats]);

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            <div className="noise-overlay" />
            <Header />

            <div className="max-w-5xl mx-auto w-full px-6 py-12 flex-1">
                {/* Introduction */}
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2">À propos</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-4">
                    Le cinéma, en plus simple
                </h1>
                <p className="max-w-2xl text-lg text-neutral-300 leading-relaxed">
                    <span className="text-white font-medium">YourMovie&apos;s</span> réunit films, séries et animes dans une
                    interface pensée pour aller à l&apos;essentiel : trouver vite, regarder sans friction, et partager avec
                    les autres.
                </p>

                {/* Chiffres */}
                <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Statistiques de YourMovie's">
                    {cards.map((card) => (
                        <div key={card.label} className="rounded-xl border border-[#262626] bg-[#0a0a0a] px-4 py-5 sm:px-5">
                            <div className="font-display text-3xl tracking-tight text-[#E8D2A6]">
                                {Number.isFinite(card.value) ? card.value.toLocaleString("fr-FR") : "—"}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">{card.label}</div>
                        </div>
                    ))}
                </div>

                {/* Fonctionnalités */}
                <section className="mt-14">
                    <h2 className="font-display text-2xl tracking-tight mb-1">Ce que vous y trouverez</h2>
                    <p className="text-sm text-neutral-500 mb-6">Au-delà du simple visionnage.</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                                <div className="text-[#E8D2A6] mb-3">{f.icon}</div>
                                <div className="text-white font-medium">{f.title}</div>
                                <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Mises à jour du catalogue */}
                <section className="mt-12 rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-r from-[#171208] to-[#0a0a0a] p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8D2A6] text-black">
                            <CalendarClock size={20} />
                        </div>
                        <div>
                            <h2 className="font-display text-2xl tracking-tight">Le catalogue s&apos;enrichit chaque semaine</h2>
                            <p className="mt-2 text-neutral-300 leading-relaxed">
                                Pour les séries et animes <span className="text-white">en cours de diffusion</span>, les épisodes
                                manquants sont ajoutés <span className="text-[#E8D2A6]">chaque semaine</span>, généralement en
                                milieu ou en fin de semaine. Un titre incomplet n&apos;est donc pas abandonné : la suite arrive.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Le projet */}
                <section className="mt-12">
                    <h2 className="font-display text-2xl tracking-tight mb-3">Un projet qui évolue</h2>
                    <p className="max-w-3xl text-neutral-300 leading-relaxed">
                        YourMovie&apos;s est en développement continu, et grandit surtout grâce aux retours de ceux qui
                        l&apos;utilisent. Chaque suggestion, chaque bug signalé et chaque titre demandé oriente la suite.
                        Si quelque chose vous manque ou vous gêne, dites-le : c&apos;est comme ça que la plateforme s&apos;améliore.
                    </p>
                </section>

                {/* Liens */}
                <section className="mt-12 grid gap-3 sm:grid-cols-2">
                    <Link
                        to="/documentation"
                        className="group flex items-center gap-4 rounded-2xl border border-[#262626] bg-[#0a0a0a] p-6 transition-colors hover:border-[#E8D2A6]/60"
                    >
                        <BookOpen size={20} className="shrink-0 text-[#E8D2A6]" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-white font-medium">Documentation</span>
                            <span className="block text-sm text-neutral-400 mt-0.5">Le guide de chaque page du site.</span>
                        </span>
                        <ArrowRight size={16} className="shrink-0 text-neutral-500 transition-transform group-hover:translate-x-1" />
                    </Link>

                    <a
                        href="https://discord.gg/6mGTfvcNeD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-4 rounded-2xl border border-[#5865F2]/40 bg-[#5865F2]/[0.07] p-6 transition-colors hover:border-[#5865F2]"
                    >
                        <MessageSquare size={20} className="shrink-0 text-[#8b93f5]" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-white font-medium">Discord</span>
                            <span className="block text-sm text-neutral-400 mt-0.5">Support, suggestions et nouveautés.</span>
                        </span>
                        <ArrowRight size={16} className="shrink-0 text-neutral-500 transition-transform group-hover:translate-x-1" />
                    </a>
                </section>
            </div>

            <Footer />
        </div>
    );
}
