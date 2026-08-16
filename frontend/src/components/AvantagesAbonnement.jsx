import React from "react";
import { Ban, Users, Star, SkipForward, Clapperboard, Palette, Crown, Check, Minus } from "lucide-react";

const LIGNES = [
    {
        icone: <Ban size={16} />,
        titre: "Publicité",
        gratuit: "Une porte à franchir avant la lecture, une publicité avant la vidéo, une bannière sur la page et une fenêtre qui s’ouvre au premier clic.",
        abonne: "Plus rien. Ni porte, ni pré-roll, ni bannière, ni fenêtre.",
    },
    {
        icone: <Users size={16} />,
        titre: "Profils",
        gratuit: "Un seul, celui du compte.",
        abonne: "Jusqu’à 4 profils, chacun avec son propre historique et ses reprises de lecture, protégeables par un code.",
    },
    {
        icone: <Star size={16} />,
        titre: "Wishboard",
        gratuit: "5 demandes en tout.",
        abonne: "Autant de demandes que tu veux.",
    },
    {
        icone: <SkipForward size={16} />,
        titre: "Lecture automatique",
        gratuit: null,
        abonne: "À 95 %, enchaîne sur l’épisode suivant, ou sur le titre d’après dans la chronologie d’un film.",
    },
    {
        icone: <Clapperboard size={16} />,
        titre: "Accueil",
        gratuit: "Une affiche fixe en fond.",
        abonne: "La bande-annonce du titre mis en avant, en fond d’écran.",
    },
    {
        icone: <Palette size={16} />,
        titre: "Apparence",
        gratuit: null,
        abonne: "Ta couleur d’accent sur tout le site, et la couleur de fond de ton profil.",
    },
    {
        icone: <Crown size={16} />,
        titre: "Compte",
        gratuit: null,
        abonne: "Une couronne à côté de ton pseudo.",
    },
];

export default function AvantagesAbonnement() {
    return (
        <section className="mt-16" data-testid="avantages-abonnement">
            <div className="mb-6 text-center">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Sans rien enjoliver</div>
                <h2 className="mt-1 font-display text-3xl tracking-tight text-white">
                    Tout ce que débloque un abonnement
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
                    Cette liste est exhaustive : ce qui n&apos;y figure pas n&apos;est pas inclus.
                </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                <div className="hidden border-b border-[#1a1a1a] px-5 py-3 text-[10px] uppercase tracking-widest text-neutral-500 sm:grid sm:grid-cols-[180px_1fr_1fr] sm:gap-6">
                    <span />
                    <span>Sans abonnement</span>
                    <span className="text-[#E8D2A6]">Avec abonnement</span>
                </div>

                {LIGNES.map((ligne) => (
                    <div
                        key={ligne.titre}
                        className="grid gap-3 border-b border-[#1a1a1a] px-5 py-4 last:border-b-0 sm:grid-cols-[180px_1fr_1fr] sm:gap-6"
                    >
                        <div className="flex items-center gap-2.5 text-sm text-white">
                            <span className="text-[#E8D2A6]">{ligne.icone}</span>
                            {ligne.titre}
                        </div>

                        <div className="flex items-start gap-2 text-sm leading-relaxed text-neutral-500">
                            {ligne.gratuit ? (
                                <>
                                    <span className="sm:hidden text-[10px] uppercase tracking-widest text-neutral-600">Sans&nbsp;:</span>
                                    <span>{ligne.gratuit}</span>
                                </>
                            ) : (
                                <>
                                    <Minus size={14} className="mt-0.5 shrink-0" />
                                    <span>Indisponible.</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-start gap-2 text-sm leading-relaxed text-neutral-300">
                            <Check size={14} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                            <span>{ligne.abonne}</span>
                        </div>
                    </div>
                ))}
            </div>

            <p className="mt-4 text-center text-xs leading-relaxed text-neutral-500">
                Les trois plans ouvrent exactement les mêmes portes. Ce qui change, c&apos;est la part
                d&apos;hébergement que tu prends à ta charge.
            </p>
        </section>
    );
}
