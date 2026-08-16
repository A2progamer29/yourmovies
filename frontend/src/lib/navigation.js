/** Les rubriques de la barre de navigation, dans leur ordre d'origine.
 *  Source unique : l'en-tête les affiche, les paramètres les réordonnent. */
export const LIENS_NAV = [
    { id: "accueil", to: "/", label: "Accueil" },
    { id: "films", to: "/browse?type=movie", label: "Films" },
    { id: "series", to: "/browse?type=series", label: "Séries" },
    { id: "animes", to: "/browse?type=anime", label: "Animes" },
    { id: "wishboard", to: "/wishboard", label: "Wishboard" },
    { id: "sondages", to: "/sondages", label: "Sondages" },
    { id: "cagnotte", to: "/cagnotte", label: "Cagnotte" },
    { id: "premium", to: "/pricing", label: "Premium" },
];

export const ORDRE_PAR_DEFAUT = LIENS_NAV.map((lien) => lien.id);

/** Applique un ordre choisi. Les identifiants inconnus sont ignorés et ceux qui
 *  manquent sont remis à la suite : une rubrique ajoutée au site plus tard reste
 *  visible pour ceux qui avaient déjà rangé leur menu. */
export function ordonnerLiens(ordre) {
    const demande = Array.isArray(ordre) ? ordre : [];
    const connus = new Map(LIENS_NAV.map((lien) => [lien.id, lien]));
    const retenus = [];
    const vus = new Set();

    demande.forEach((id) => {
        const lien = connus.get(id);
        if (lien && !vus.has(id)) {
            vus.add(id);
            retenus.push(lien);
        }
    });
    LIENS_NAV.forEach((lien) => {
        if (!vus.has(lien.id)) retenus.push(lien);
    });
    return retenus;
}
