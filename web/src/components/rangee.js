import { h, cascader } from "../core/dom.js";
import { affiche, afficheSquelette } from "./affiche.js";

/**
 * Rangée de titres qui défile. Le défilement est confié au navigateur
 * (débordement + ancrage) plutôt qu'à un calcul de position : il gère
 * déjà le doigt, la molette, le clavier et l'inertie, mieux que ce
 * qu'on réécrirait.
 */
export function rangee({ titre, surTitre, lienTout, items = [], progressions = {} }) {
    const cartes = items.map((media, index) => affiche(media, {
        progression: progressions[media.id] || 0,
        priorite: index < 6,
    }));
    cascader(cartes);

    return h("section", { class: "section" },
        h("div", { class: "section__entete" },
            h("div", null,
                surTitre ? h("div", { class: "section__sur-titre" }, surTitre) : null,
                h("h2", null, titre),
            ),
            lienTout ? h("a", { class: "section__lien", href: lienTout }, "Tout voir →") : null,
        ),
        h("div", { class: "rangee cascade" }, cartes),
    );
}

/** Rangée d'attente : même gabarit, pour éviter le saut de mise en page. */
export function rangeeSquelette({ titre, nombre = 8 }) {
    return h("section", { class: "section" },
        h("div", { class: "section__entete" },
            h("h2", null, titre),
        ),
        h("div", { class: "rangee" },
            Array.from({ length: nombre }, () => afficheSquelette())),
    );
}
