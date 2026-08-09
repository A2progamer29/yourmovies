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
