import { h } from "../core/dom.js";

export function pageIntrouvable() {
    return h("div", { class: "page vide" },
        h("div", { class: "vide__titre" }, "Page introuvable"),
        h("p", null, "Ce lien ne mene nulle part."),
        h("a", { class: "btn btn--principal", href: "/", style: { marginTop: "24px" } }, "Retour a l'accueil"),
    );
}
