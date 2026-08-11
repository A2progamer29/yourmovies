import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    Home, Compass, PlayCircle, Film, Heart, Coins, Crown, Sparkles,
    MessageSquare, Users, Settings, PiggyBank, BookOpen,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const DOCS = [
    {
        id: "accueil",
        icon: <Home size={16} />,
        title: "Accueil",
        href: "/",
        summary: "Le point de départ : ce qui est à l'affiche et ce que vous avez commencé.",
        points: [
            ["À l'affiche", "Le grand visuel en haut met en avant une sélection. Les flèches sur les côtés permettent de passer d'un titre à l'autre."],
            ["Continuer à regarder", "Reprend un film ou un épisode là où vous vous êtes arrêté. Une série dont vous venez de finir un épisode vous propose directement le suivant."],
            ["Top 10", "Les titres les plus regardés sur la plateforme, tous types confondus."],
            ["Films, Séries, Animes", "Des rangées défilantes : utilisez les flèches, la molette de la souris ou le glissement du doigt. « Tout voir » ouvre le catalogue filtré."],
            ["Genres", "Un clic sur un genre ouvre le catalogue déjà filtré dessus."],
        ],
    },
    {
        id: "catalogue",
        icon: <Compass size={16} />,
        title: "Catalogue",
        href: "/browse",
        summary: "Toute la bibliothèque, avec les outils pour trouver précisément ce que vous cherchez.",
        points: [
            ["Recherche", "Tapez un titre : les résultats se filtrent au fur et à mesure."],
            ["Filtres", "Type (film, série, anime), genre, année et note minimale. Ils se combinent entre eux."],
            ["Effacer les filtres", "Remet la liste complète en un clic."],
        ],
    },
    {
        id: "fiche",
        icon: <Film size={16} />,
        title: "Fiche d'un titre",
        summary: "Toutes les informations d'un film, d'une série ou d'un anime, rangées par rubrique.",
        points: [
            ["Épisodes", "La liste des saisons et de leurs épisodes, pour les séries et animes."],
            ["Bande-annonce", "L'aperçu vidéo quand il est disponible."],
            ["Distribution", "Le réalisateur et le casting principal."],
            ["Avis", "Les notes et commentaires de la communauté. Vous pouvez publier le vôtre et répondre aux autres."],
            ["Similaires", "Des titres proches, et l'ordre de visionnage conseillé quand l'œuvre fait partie d'un ensemble."],
        ],
    },
    {
        id: "lecture",
        icon: <PlayCircle size={16} />,
        title: "Lecture",
        summary: "Le lecteur vidéo et ses commandes.",
        points: [
            ["Navigation des épisodes", "Sous la vidéo : « Précédent », le sélecteur central et « Suivant ». Le sélecteur ouvre la liste complète des saisons."],
            ["Reprise automatique", "Votre position est enregistrée régulièrement : vous reprenez au bon endroit à votre prochaine visite."],
            ["Watch Party", "Créez un salon et partagez le code affiché, ou saisissez celui d'un ami pour regarder ensemble, en lecture synchronisée avec un chat."],
            ["Publicité", "Les visiteurs non abonnés passent par un court écran avant la lecture. Le Premium le supprime."],
        ],
    },
    {
        id: "listes",
        icon: <Heart size={16} />,
        title: "Favoris et watchlist",
        summary: "Vos deux listes personnelles, accessibles depuis votre profil.",
        points: [
            ["Favoris", "Le cœur sur une affiche. Sur mobile, un double tap sur la vignette."],
            ["Watchlist", "Le marque-page, pour ce que vous prévoyez de regarder. Sur mobile, un appui long."],
        ],
    },
    {
        id: "wishboard",
        icon: <Sparkles size={16} />,
        title: "Wishboard",
        href: "/wishboard",
        summary: "Proposez les titres que vous aimeriez voir arriver, et votez pour ceux des autres.",
        points: [
            ["Proposer", "Recherchez un titre et ajoutez-le. Chaque proposition rapporte des Freemium."],
            ["Voter", "Les propositions sont classées par nombre de votes : les plus demandées sont traitées en priorité."],
            ["Statuts", "Une demande peut être approuvée, mise en attente ou refusée par l'équipe."],
        ],
    },
    {
        id: "freemium",
        icon: <Coins size={16} />,
        title: "Freemium",
        href: "/coins",
        summary: "La monnaie du site, qui s'échange contre du Premium. Elle n'a aucune valeur réelle.",
        points: [
            ["Comment en gagner", "Connexion quotidienne (la série augmente le gain), avis publiés, propositions au Wishboard."],
            ["Soutenir gratuitement", "Depuis Paramètres → Abonnement, regarder une publicité rapporte des Freemium et finance l'hébergement."],
            ["Échanger", "Convertissez votre solde en jours de Premium. Cliquez une carte pour changer la durée proposée."],
        ],
    },
    {
        id: "premium",
        icon: <Crown size={16} />,
        title: "Premium",
        href: "/pricing",
        summary: "L'abonnement payant : aucune publicité, multi-profils et qualité maximale.",
        points: [
            ["Choisir une offre", "Trois formules, en mensuel ou annuel. Une offre de bienvenue s'applique aux nouveaux inscrits."],
            ["Paiement", "Il se finalise sur notre Discord, salon #ticket : carte bancaire, PayPal, Paysafecard et autres moyens."],
            ["Activation", "L'accès est attribué manuellement par l'équipe après confirmation du paiement."],
        ],
    },
    {
        id: "communaute",
        icon: <MessageSquare size={16} />,
        title: "Communauté",
        summary: "Les échanges entre membres.",
        points: [
            ["Avis", "Notez de 0 à 10 et commentez depuis la fiche d'un titre. Les réponses sont possibles sous chaque avis."],
            ["Messagerie", "Discussions privées entre membres, avec compteur de messages non lus."],
            ["Profils publics", "Chaque membre a une page avec sa bio, ses avis et son historique — selon ses réglages de confidentialité."],
        ],
    },
    {
        id: "profils",
        icon: <Users size={16} />,
        title: "Profils",
        href: "/profiles",
        summary: "Réservé aux abonnés Premium : jusqu'à 4 profils par compte.",
        points: [
            ["Séparer les usages", "Chaque profil a son propre historique, ses favoris et ses recommandations."],
            ["Profil enfant", "Limite le catalogue selon l'âge choisi."],
            ["Code PIN", "Protège l'accès à un profil."],
        ],
    },
    {
        id: "parametres",
        icon: <Settings size={16} />,
        title: "Paramètres",
        href: "/settings",
        summary: "Votre compte et vos préférences.",
        points: [
            ["Profil", "Pseudo, bio, photo et bannière. Les modifications sont enregistrées automatiquement."],
            ["Abonnement", "État de votre Premium, et le soutien gratuit par publicité."],
            ["Confidentialité", "Choisissez si votre profil, vos avis et votre historique sont visibles."],
            ["Sécurité", "Mot de passe et code PIN du compte."],
        ],
    },
    {
        id: "cagnotte",
        icon: <PiggyBank size={16} />,
        title: "Cagnotte",
        href: "/cagnotte",
        summary: "Le financement participatif du projet, avec des paliers de récompenses.",
        points: [
            ["Contribuer", "Choisissez un montant ; la contribution se finalise sur le Discord."],
            ["Paliers", "Chaque seuil atteint débloque une récompense pour la communauté."],
        ],
    },
];

export default function DocsPage() {
    const [open, setOpen] = useState("accueil");

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            <div className="noise-overlay" />
            <Header />

            <div className="max-w-5xl mx-auto w-full px-6 py-12 flex-1">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2 flex items-center gap-2">
                    <BookOpen size={14} /> Documentation
                </div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-3">Comment ça marche</h1>
                <p className="text-neutral-400 max-w-2xl mb-10">
                    Le guide de chaque page du site. Cliquez une rubrique pour la déplier.
                </p>

                <div className="space-y-3">
                    {DOCS.map((doc) => {
                        const isOpen = open === doc.id;
                        return (
                            <section
                                key={doc.id}
                                id={doc.id}
                                className={`rounded-2xl border transition-colors ${isOpen ? "border-[#E8D2A6]/40 bg-[#0d0b07]" : "border-[#262626] bg-[#0a0a0a]"}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpen(isOpen ? null : doc.id)}
                                    aria-expanded={isOpen}
                                    data-testid={`doc-${doc.id}`}
                                    className="flex w-full items-center gap-3 px-5 py-4 text-left"
                                >
                                    <span className={isOpen ? "text-[#E8D2A6]" : "text-neutral-500"}>{doc.icon}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-display text-xl text-white">{doc.title}</span>
                                        <span className="block text-sm text-neutral-500 mt-0.5">{doc.summary}</span>
                                    </span>
                                    <span className={`shrink-0 text-neutral-500 transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
                                </button>

                                {isOpen && (
                                    <div className="px-5 pb-5">
                                        <dl className="space-y-3 border-t border-white/5 pt-4">
                                            {doc.points.map(([term, desc]) => (
                                                <div key={term}>
                                                    <dt className="text-sm font-medium text-[#E8D2A6]">{term}</dt>
                                                    <dd className="text-sm text-neutral-400 leading-relaxed mt-0.5">{desc}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                        {doc.href && (
                                            <Link
                                                to={doc.href}
                                                className="mt-4 inline-flex h-10 items-center rounded-full border border-[#262626] px-4 text-sm text-neutral-200 transition-colors hover:border-[#E8D2A6] hover:text-[#E8D2A6]"
                                            >
                                                Ouvrir cette page →
                                            </Link>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>

                <div className="mt-10 rounded-2xl border border-[#262626] bg-[#0a0a0a] p-6 text-center">
                    <div className="font-display text-xl text-white">Une question sans réponse ici ?</div>
                    <p className="mt-1 text-sm text-neutral-400">L&apos;équipe et la communauté répondent sur le Discord.</p>
                    <a
                        href="https://discord.gg/6mGTfvcNeD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#5865F2] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#4752C4]"
                    >
                        Rejoindre le Discord
                    </a>
                </div>
            </div>

            <Footer />
        </div>
    );
}
