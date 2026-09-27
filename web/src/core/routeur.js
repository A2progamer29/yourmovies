import { monter } from "./dom.js";

/**
 * Routeur. URL réelles (pas de dièse), motifs à paramètres, et une
 * seule règle : une page est une fonction qui reçoit son contexte et
 * renvoie un élément.
 *
 * Chaque page peut renvoyer une fonction de nettoyage ; elle est
 * appelée avant la page suivante. Sans cela, minuteurs et écouteurs
 * survivraient à la navigation et s'accumuleraient à chaque visite —
 * la fuite la plus courante d'une application d'une seule page.
 */

const routes = [];
let conteneur = null;
let nettoyageCourant = null;
let jetonNavigation = 0;

/** Transforme "/media/:id" en expression régulière + noms de paramètres. */
function compiler(motif) {
    const noms = [];
    const source = motif
        .replace(/\/$/, "")
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/:(\w+)/g, (_, nom) => { noms.push(nom); return "([^/]+)"; })
        .replace(/\*/g, ".*");
    return { regex: new RegExp(`^${source || "/"}$`), noms };
}

export function definirRoutes(definitions) {
    for (const definition of definitions) {
        routes.push({ ...definition, ...compiler(definition.chemin) });
    }
}

function resoudre(chemin) {
    const propre = chemin.replace(/\/+$/, "") || "/";
    for (const route of routes) {
        const trouve = route.regex.exec(propre);
        if (!trouve) continue;
        const parametres = {};
        route.noms.forEach((nom, index) => {
            parametres[nom] = decodeURIComponent(trouve[index + 1]);
        });
        return { route, parametres };
    }
    return null;
}

/** Navigation interne : aucun rechargement, l'historique suit. */
export function aller(chemin, { remplacer = false } = {}) {
    if (chemin === location.pathname + location.search) return;
    if (remplacer) history.replaceState({}, "", chemin);
    else history.pushState({}, "", chemin);
    rendre();
}

async function rendre() {
    const jeton = ++jetonNavigation;
    const correspondance = resoudre(location.pathname);

    if (typeof nettoyageCourant === "function") {
        try { nettoyageCourant(); } catch { /* un nettoyage fautif ne bloque pas la suite */ }
    }
    nettoyageCourant = null;

    if (!correspondance) {
        const { pageIntrouvable } = await import("../pages/introuvable.js");
        monter(conteneur, pageIntrouvable());
        return;
    }

    const contexte = {
        parametres: correspondance.parametres,
        requete: Object.fromEntries(new URLSearchParams(location.search)),
        chemin: location.pathname,
    };

    const sortie = await correspondance.route.vue(contexte);

    // Une navigation plus récente a pu démarrer pendant le chargement du
    // module : sans ce garde, la page lente écraserait la page voulue.
    if (jeton !== jetonNavigation) return;

    const element = typeof sortie === "function" ? sortie() : sortie;
    if (element && typeof element.nettoyer === "function") nettoyageCourant = element.nettoyer;
    if (element?.element) {
        nettoyageCourant = element.nettoyer || null;
        monter(conteneur, element.element);
    } else {
        monter(conteneur, element);
    }

    conteneur.firstElementChild?.classList.add("page-entre");
    document.title = correspondance.route.titre
        ? `${correspondance.route.titre} · YourMovie's`
        : "YourMovie's";
    window.scrollTo({ top: 0, behavior: "instant" });
    document.dispatchEvent(new CustomEvent("ym:navigation", { detail: contexte }));
}

export function demarrerRouteur(cible) {
    conteneur = cible;

    window.addEventListener("popstate", rendre);

    // Un seul écouteur pour tous les liens internes, posé sur le
    // document : les pages n'ont rien à brancher, et les liens créés
    // après coup fonctionnent sans rien réenregistrer.
    document.addEventListener("click", (evenement) => {
        if (evenement.defaultPrevented || evenement.button !== 0) return;
        if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;

        const lien = evenement.target.closest("a[href]");
        if (!lien) return;
        if (lien.target === "_blank" || lien.hasAttribute("download")) return;

        const url = new URL(lien.href, location.origin);
        if (url.origin !== location.origin) return;

        evenement.preventDefault();
        aller(url.pathname + url.search);
    });

    rendre();
}
