import { h, monter } from "../core/dom.js";
import { RUBRIQUES } from "../config/index.js";
import { compte } from "../core/etat.js";

/**
 * En-tête du site. Deux mises en page pour un seul balisage : la barre
 * complète au-dessus de 900 px, un panneau déroulant en dessous.
 *
 * Le menu mobile manquait dans l'ancienne version : la barre était
 * simplement masquée et huit rubriques devenaient inaccessibles au
 * téléphone. Ici les deux formes partagent la même liste.
 */
export function entete() {
    const liens = h("nav", { class: "entete__nav" });
    const menuMobile = h("nav", {
        class: "entete__menu",
        id: "menu-mobile",
        hidden: true,
    });
    const zoneCompte = h("div", { class: "entete__compte" });

    function peindreLiens() {
        const chemin = location.pathname + location.search;
        const construire = (classe) => RUBRIQUES.map((rubrique) => h("a", {
            href: rubrique.chemin,
            class: [classe, { actif: chemin === rubrique.chemin }],
        }, rubrique.libelle));

        monter(liens, construire("entete__lien"));
        monter(menuMobile, construire("entete__menu-lien"));
    }

    function peindreCompte(utilisateur) {
        if (utilisateur === undefined) {
            monter(zoneCompte, h("div", { class: "cercle", style: { width: "18px", height: "18px" } }));
            return;
        }
        if (!utilisateur) {
            monter(zoneCompte, h("a", { class: "btn btn--principal btn--petit", href: "/connexion" }, "Connexion"));
            return;
        }
        monter(zoneCompte,
            h("a", { class: "entete__avatar", href: "/compte", title: utilisateur.name },
                utilisateur.picture
                    ? h("img", { src: utilisateur.picture, alt: "" })
                    : h("span", null, (utilisateur.name || "?")[0].toUpperCase()),
            ),
        );
    }

    const bouton = h("button", {
        class: "entete__bascule btn btn--fantome btn--icone",
        type: "button",
        "aria-label": "Ouvrir le menu",
        "aria-expanded": "false",
        "aria-controls": "menu-mobile",
        onclick: () => basculer(),
    }, icone("menu"));

    function basculer(force) {
        const ouvert = force ?? menuMobile.hidden;
        menuMobile.hidden = !ouvert;
        bouton.setAttribute("aria-expanded", String(ouvert));
        bouton.setAttribute("aria-label", ouvert ? "Fermer le menu" : "Ouvrir le menu");
        monter(bouton, icone(ouvert ? "fermer" : "menu"));
    }

    // Le menu se referme à la navigation : sans cela il resterait ouvert
    // par-dessus la page qu'on vient d'atteindre.
    document.addEventListener("ym:navigation", () => { basculer(false); peindreLiens(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") basculer(false); });

    compte.surChangement(peindreCompte);
    peindreLiens();

    return h("header", { class: "entete" },
        h("div", { class: "entete__barre page" },
            h("a", { class: "entete__logo", href: "/" },
                h("img", { src: "/logo.png", alt: "", width: 32, height: 32 }),
                h("span", null, "YourMovie", h("i", null, "'s")),
            ),
            liens,
            h("div", { class: "pousse rang", style: { gap: "8px" } },
                h("a", { class: "btn btn--fantome btn--icone", href: "/recherche", "aria-label": "Rechercher" }, icone("loupe")),
                zoneCompte,
                bouton,
            ),
        ),
        menuMobile,
    );
}

/** Icônes en ligne : aucune requête, aucun paquet, et elles héritent de la couleur du texte. */
function icone(nom) {
    const chemins = {
        menu: "M4 7h16M4 12h16M4 17h16",
        fermer: "M6 6l12 12M18 6L6 18",
        loupe: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const trace = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trace.setAttribute("d", chemins[nom] || "");
    svg.append(trace);
    return svg;
}
