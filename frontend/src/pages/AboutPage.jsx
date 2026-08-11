import React, { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { api } from "@/lib/api";

export default function AboutPage() {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        let active = true;
        api.get("/public/stats", { silent: true })
            .then((response) => {
                if (active) setStats(response.data);
            })
            .catch(() => {
                if (active) setStats(null);
            });
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
            <div className="max-w-5xl mx-auto px-6 py-12 flex-1">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2">À propos</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-8">À propos de nous</h1>

                <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Statistiques de YourMovie's">
                    {cards.map((card) => (
                        <div key={card.label} className="border border-[#262626] bg-[#0a0a0a] px-4 py-5 sm:px-5">
                            <div className="font-display text-3xl tracking-tight text-[#E8D2A6]">
                                {Number.isFinite(card.value) ? card.value.toLocaleString("fr-FR") : "—"}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">{card.label}</div>
                        </div>
                    ))}
                </div>

                <div className="max-w-3xl space-y-5 text-neutral-300 leading-relaxed">
                    <p>
                        <span className="text-white font-medium">YourMovie&apos;s</span> est un projet qui vise à améliorer l&apos;expérience utilisateur
                        et se démarque par une interface moderne, simple et agréable à utiliser.
                    </p>
                    <p>
                        La plateforme réunit films, séries et animes dans un même espace, avec une navigation claire et un catalogue facile à explorer.
                        Elle permet aussi de reprendre un contenu là où il a été arrêté et de découvrir des recommandations adaptées à son historique.
                    </p>
                    <p>
                        YourMovie&apos;s va au-delà du visionnage avec des profils personnalisables, des avis et discussions, la messagerie,
                        les Watch Parties, le Wishboard communautaire et le système Freemium. Ces fonctionnalités sont pensées pour rendre
                        l&apos;expérience plus personnelle, interactive et communautaire.
                    </p>
                    <p className="rounded-xl border border-[#E8D2A6]/25 bg-[#0a0a0a] p-5">
                        <span className="text-white font-medium">Séries et animes en cours de diffusion :</span> les épisodes manquants sont
                        ajoutés <span className="text-[#E8D2A6]">chaque semaine</span>, généralement en milieu ou en fin de semaine.
                        Un titre incomplet n&apos;est donc pas abandonné — la suite arrive.
                    </p>
                    <p>
                        Le projet continue d&apos;évoluer grâce aux retours des utilisateurs. Les suggestions, le support et les nouveautés
                        sont également accessibles depuis le serveur <a href="https://discord.gg/6mGTfvcNeD" target="_blank" rel="noopener noreferrer" className="text-[#E8D2A6] hover:underline">Discord de YourMovie&apos;s</a>.
                    </p>
                </div>
            </div>
            <Footer />
        </div>
    );
}
