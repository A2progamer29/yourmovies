import React from "react";

/** Jeu de silhouettes partagé. Chacune reprend les dimensions exactes du
 *  contenu qu'elle remplace : sans cela, la page se réorganise sous les yeux
 *  au moment où les données arrivent. */

export const Bloc = ({ className = "" }) => (
    <div className={`animate-pulse rounded-lg bg-[#111] ${className}`} />
);

const Enveloppe = ({ children, label }) => (
    <div aria-busy="true" aria-label={label} data-testid="skeleton">{children}</div>
);

/** Grille d'affiches : catalogue, résultats de recherche. */
export const GrilleSkeleton = ({ nombre = 18 }) => (
    <Enveloppe label="Chargement du catalogue">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: nombre }).map((_, i) => (
                <div key={i}>
                    <Bloc className="aspect-[2/3] w-full" />
                    <Bloc className="mt-2 h-3 w-3/4" />
                </div>
            ))}
        </div>
    </Enveloppe>
);

/** Liste de lignes : wishboard, sondages, filleuls. */
export const ListeSkeleton = ({ nombre = 5, hauteur = "h-[76px]" }) => (
    <Enveloppe label="Chargement">
        <div className="space-y-3">
            {Array.from({ length: nombre }).map((_, i) => (
                <Bloc key={i} className={`w-full ${hauteur}`} />
            ))}
        </div>
    </Enveloppe>
);

/** Encadrés d'une page de compte : soldes, offres, réglages. */
export const PanneauSkeleton = ({ colonnes = 2, nombre = 4 }) => (
    <Enveloppe label="Chargement">
        <div className={`grid gap-4 ${colonnes === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            {Array.from({ length: nombre }).map((_, i) => (
                <Bloc key={i} className="h-32 w-full rounded-2xl" />
            ))}
        </div>
    </Enveloppe>
);

/** Fiche d'un contenu : affiche à gauche, informations à droite. */
export const FicheSkeleton = () => (
    <Enveloppe label="Chargement de la fiche">
        <Bloc className="h-[45vh] min-h-[300px] w-full rounded-none" />
        <div className="mx-auto -mt-24 max-w-7xl px-6">
            <div className="flex flex-col gap-6 sm:flex-row">
                <Bloc className="aspect-[2/3] w-40 shrink-0 sm:w-52" />
                <div className="min-w-0 flex-1 pt-4">
                    <Bloc className="h-9 w-2/3 max-w-md" />
                    <Bloc className="mt-3 h-4 w-40" />
                    <Bloc className="mt-6 h-4 w-full" />
                    <Bloc className="mt-2 h-4 w-full" />
                    <Bloc className="mt-2 h-4 w-2/3" />
                    <div className="mt-7 flex gap-3">
                        <Bloc className="h-12 w-40 rounded-full" />
                        <Bloc className="h-12 w-12 rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    </Enveloppe>
);

/** Titre de page suivi de son contenu, pour les pages simples. */
export const EnteteSkeleton = () => (
    <Enveloppe label="Chargement">
        <Bloc className="h-10 w-64 max-w-full" />
        <Bloc className="mt-4 h-4 w-full max-w-xl" />
    </Enveloppe>
);
