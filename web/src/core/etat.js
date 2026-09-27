/**
 * État partagé. Un magasin minuscule plutôt qu'une bibliothèque : le
 * site n'a besoin que de trois choses globales — le compte connecté,
 * le profil actif, et les réglages du site. Tout le reste appartient
 * à la page qui l'affiche et meurt avec elle.
 */

function creerMagasin(valeurInitiale) {
    let valeur = valeurInitiale;
    const abonnes = new Set();

    return {
        lire: () => valeur,
        ecrire(nouvelle) {
            const suivante = typeof nouvelle === "function" ? nouvelle(valeur) : nouvelle;
            if (Object.is(suivante, valeur)) return valeur;
            valeur = suivante;
            for (const abonne of abonnes) {
                try { abonne(valeur); } catch { /* un abonné fautif n'empêche pas les autres */ }
            }
            return valeur;
        },
        /** Renvoie la fonction de désabonnement, à appeler au démontage. */
        surChangement(abonne, immediat = true) {
            abonnes.add(abonne);
            if (immediat) abonne(valeur);
            return () => abonnes.delete(abonne);
        },
    };
}

/** Compte connecté, ou null. `undefined` signifie « pas encore chargé ». */
export const compte = creerMagasin(undefined);

/** Profil actif au sein du compte, ou null. */
export const profil = creerMagasin(null);

/** Réglages publics du site : publicité, parrainage, bandeau. */
export const reglages = creerMagasin({});

export { creerMagasin };
