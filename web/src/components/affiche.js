import { h } from "../core/dom.js";
import { GENRES } from "../config/index.js";

/**
 * Affiche d'un titre. Le composant le plus répété du site : tout y est
 * pesé, jusqu'au chargement différé des images hors écran.
 */
export function affiche(media, { progression = 0, priorite = false } = {}) {
    const lien = `/titre/${media.id}`;

    return h("a", {
        href: lien,
        class: "affiche",
        "aria-label": media.title,
    },
        media.poster_url
            ? h("img", {
                class: "affiche__image",
                src: media.poster_url,
                alt: "",
                // Les premières affiches sont chargées tout de suite :
                // différer celles qui sont déjà visibles retarderait
                // l'affichage utile sans rien économiser.
                loading: priorite ? "eager" : "lazy",
                decoding: "async",
                fetchpriority: priorite ? "high" : "auto",
            })
            : h("div", { class: "affiche__image" }),

        h("div", { class: "affiche__voile" },
            h("span", { class: "affiche__titre" }, media.title),
            h("span", { class: "affiche__meta" },
                [GENRES[media.type] || "Film", media.year].filter(Boolean).join(" · ")),
        ),

        progression > 0 && progression < 98
            ? h("div", { class: "affiche__progression" },
                h("span", { style: { width: `${Math.min(100, progression)}%` } }))
            : null,
    );
}

/** Silhouette d'attente, aux proportions exactes d'une affiche. */
export function afficheSquelette() {
    return h("div", { class: "squelette", style: { aspectRatio: "2 / 3" } });
}
