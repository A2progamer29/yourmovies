/**
 * Configuration. Tout ce qui dépend de l'environnement passe par ici :
 * aucune URL de serveur ne doit être écrite au milieu d'une page.
 */

const ORIGINE_PRODUCTION = "https://yourmovies-backend.onrender.com";

/**
 * L'adresse du serveur peut être posée à la construction dans une
 * balise meta. À défaut, le développement local parle au serveur
 * local, et tout le reste à la production.
 */
function resoudreApi() {
    const declaree = document.querySelector('meta[name="ym-api"]')?.content?.trim();
    if (declaree) return declaree.replace(/\/$/, "") + "/api";

    // En developpement, le serveur local relaie /api : meme origine, donc
    // aucun probleme de CORS et aucun backend a installer sur la machine.
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    return local ? "/api" : ORIGINE_PRODUCTION + "/api";
}

export const API_BASE = resoudreApi();

/**
 * Sous-chemin de publication. Le site vit normalement a la racine, mais
 * doit pouvoir etre servi sous un prefixe — un apercu cote a cote avec
 * la version actuelle, par exemple. Tous les liens passent par lien().
 */
export const BASE = (document.querySelector('meta[name="ym-base"]')?.content || "/")
    .replace(/\/+$/, "");

/** Construit un lien interne en tenant compte du sous-chemin. */
export function lien(chemin) {
    return BASE + (chemin.startsWith("/") ? chemin : `/${chemin}`);
}

/** Rubriques de la barre de navigation, dans leur ordre d'origine. */
export const RUBRIQUES = [
    { id: "accueil", libelle: "Accueil", chemin: "/" },
    { id: "films", libelle: "Films", chemin: "/parcourir?type=movie" },
    { id: "series", libelle: "Séries", chemin: "/parcourir?type=series" },
    { id: "animes", libelle: "Animes", chemin: "/parcourir?type=anime" },
    { id: "wishboard", libelle: "Wishboard", chemin: "/wishboard" },
    { id: "sondages", libelle: "Sondages", chemin: "/sondages" },
    { id: "cagnotte", libelle: "Cagnotte", chemin: "/cagnotte" },
    { id: "premium", libelle: "Premium", chemin: "/premium" },
];

export const GENRES = {
    movie: "Film",
    series: "Série",
    anime: "Anime",
};

export const DISCORD = "https://discord.gg/6mGTfvcNeD";
