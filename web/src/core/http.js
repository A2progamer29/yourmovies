import { API_BASE } from "../config/index.js";
import { lireLocal, supprimerLocal } from "./stockage.js";

/**
 * Client HTTP. Une seule porte vers le serveur : le jeton, le profil
 * actif, les erreurs et la mesure de lenteur y sont traités une fois
 * pour toutes, au lieu d'être répétés dans chaque page.
 */

const abonnesAttente = new Set();
const enCours = new Map();
let compteur = 0;

/** Erreur portant le code HTTP et le message du serveur. */
export class ErreurHttp extends Error {
    constructor(statut, detail, donnees) {
        super(detail || `Erreur ${statut}`);
        this.name = "ErreurHttp";
        this.statut = statut;
        this.donnees = donnees;
    }
}

function debutLePlusAncien() {
    let plusAncien = null;
    for (const instant of enCours.values()) {
        if (plusAncien === null || instant < plusAncien) plusAncien = instant;
    }
    return plusAncien;
}

function prevenir() {
    const debut = debutLePlusAncien();
    for (const abonne of abonnesAttente) {
        try { abonne(debut); } catch { /* un abonné fautif n'interrompt pas les autres */ }
    }
}

/**
 * S'abonne à l'attente réseau : reçoit l'instant de départ de la plus
 * ancienne requête en cours, ou null quand plus rien n'est en attente.
 * C'est ce signal qui alimente l'indicateur de connexion lente.
 */
export function surAttenteReseau(abonne) {
    abonnesAttente.add(abonne);
    abonne(debutLePlusAncien());
    return () => abonnesAttente.delete(abonne);
}

function enTetes(options) {
    const entetes = { Accept: "application/json", ...(options.headers || {}) };

    const jeton = lireLocal("ym_token");
    if (jeton) entetes.Authorization = `Bearer ${jeton}`;

    const profil = lireLocal("ym_profile_id");
    if (profil) entetes["X-Profile-Id"] = profil;

    if (options.body !== undefined && !(options.body instanceof FormData)) {
        entetes["Content-Type"] = "application/json";
    }
    return entetes;
}

function avecParametres(chemin, parametres) {
    if (!parametres) return chemin;
    const propres = Object.entries(parametres)
        .filter(([, valeur]) => valeur !== undefined && valeur !== null && valeur !== "");
    if (!propres.length) return chemin;
    return `${chemin}?${new URLSearchParams(propres)}`;
}

async function requete(methode, chemin, options = {}) {
    const identifiant = ++compteur;
    enCours.set(identifiant, Date.now());
    prevenir();

    try {
        const reponse = await fetch(API_BASE + avecParametres(chemin, options.params), {
            method: methode,
            headers: enTetes(options),
            body: options.body instanceof FormData
                ? options.body
                : options.body !== undefined ? JSON.stringify(options.body) : undefined,
            signal: options.signal,
        });

        const texte = await reponse.text();
        const donnees = texte ? tenterJson(texte) : null;

        if (!reponse.ok) {
            // Un jeton refusé ne sert plus : le garder ferait échouer
            // chaque chargement suivant de la même façon.
            if (reponse.status === 401 || reponse.status === 403) {
                if (chemin === "/auth/me") supprimerLocal("ym_token");
            }
            throw new ErreurHttp(reponse.status, donnees?.detail, donnees);
        }
        return donnees;
    } finally {
        enCours.delete(identifiant);
        prevenir();
    }
}

function tenterJson(texte) {
    try { return JSON.parse(texte); } catch { return texte; }
}

export const api = {
    get: (chemin, options) => requete("GET", chemin, options),
    post: (chemin, body, options) => requete("POST", chemin, { ...options, body }),
    put: (chemin, body, options) => requete("PUT", chemin, { ...options, body }),
    patch: (chemin, body, options) => requete("PATCH", chemin, { ...options, body }),
    delete: (chemin, options) => requete("DELETE", chemin, options),
};

/**
 * Message lisible pour une erreur quelconque. Le détail du serveur
 * prime quand il existe : il est écrit pour la personne, pas pour la
 * console.
 */
export function messageErreur(erreur, defaut = "Une erreur est survenue.") {
    if (erreur instanceof ErreurHttp) {
        if (erreur.statut === 401) return "Tu dois être connecté pour faire ça.";
        if (erreur.statut === 403) return erreur.message || "Accès refusé.";
        if (erreur.statut === 404) return erreur.message || "Introuvable.";
        if (erreur.statut === 429) return erreur.message || "Trop de tentatives, patiente un instant.";
        return erreur.message || defaut;
    }
    if (erreur?.name === "AbortError") return null;
    return defaut;
}
