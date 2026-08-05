import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            <div className="noise-overlay" />
            <Header />
            <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2">À propos</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-8">À propos de nous</h1>

                <div className="space-y-5 text-neutral-300 leading-relaxed">
                    <p>
                        <span className="text-white font-medium">YourMovie&apos;s</span> est une plateforme communautaire dédiée aux films, séries et animes.
                        Elle a été imaginée et développée par <span className="text-[#E8D2A6]">Lune27</span>.
                    </p>
                    <p>
                        Notre objectif : rassembler une communauté de passionnés autour d&apos;un catalogue soigné, avec des fonctionnalités
                        qui vont au-delà du simple visionnage — avis et notes, discussions, watch party pour regarder à plusieurs,
                        Wishboard pour proposer et voter les prochains titres, monnaie <span className="text-[#E8D2A6]">Freemium</span> à gagner, profils et messagerie.
                    </p>
                    <p>
                        Le projet est en évolution constante, guidé par les retours de la communauté. Les échanges, le support et les annonces
                        se font principalement sur notre serveur <span className="text-[#E8D2A6]">Discord</span> (lien en bas de page).
                    </p>
                    <p className="text-neutral-400">
                        YourMovie&apos;s n&apos;héberge aucun fichier vidéo sur ses serveurs : les contenus proviennent de sources tierces externes.
                        Voir nos <a href="/cgu" className="text-[#E8D2A6] hover:underline">Conditions d&apos;utilisation</a> pour plus de détails.
                    </p>
                </div>
            </div>
            <Footer />
        </div>
    );
}
