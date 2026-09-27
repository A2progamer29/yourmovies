import { h, monter } from "../core/dom.js";
import { api } from "../core/http.js";
import { rangee, rangeeSquelette } from "../components/rangee.js";
import { GENRES } from "../config/index.js";

/**
 * Accueil. Les rangées sont peintes dès que leurs données arrivent,
 * chacune indépendamment : une requête lente n'immobilise plus la page
 * entière derrière elle.
 */
export async function pageAccueil() {
    const conteneur = h("div", { class: "page" });
    const vedette = h("div");
    const rangees = h("div");

    monter(conteneur, vedette, rangees);
    monter(rangees,
        rangeeSquelette({ titre: "Ajouts récents" }),
        rangeeSquelette({ titre: "Films" }),
        rangeeSquelette({ titre: "Séries" }),
    );

    let vivant = true;

    (async () => {
        try {
            const [recents, aLAffiche] = await Promise.all([
                api.get("/media", { params: { limit: 24 } }),
                api.get("/media", { params: { featured: true, limit: 8 } }),
            ]);
            if (!vivant) return;

            const parType = (type) => recents.filter((m) => m.type === type);

            monter(vedette, aLAffiche.length ? banniere(aLAffiche[0]) : null);
            monter(rangees,
                recents.length ? rangee({
                    surTitre: "Nouveautés",
                    titre: "Ajouts récents",
                    items: recents.slice(0, 18),
                    lienTout: "/parcourir",
                }) : null,
                ...["movie", "series", "anime"].map((type) => {
                    const items = parType(type);
                    return items.length ? rangee({
                        titre: `${GENRES[type]}s`,
                        items,
                        lienTout: `/parcourir?type=${type}`,
                    }) : null;
                }),
                recents.length ? null : h("div", { class: "vide" },
                    h("div", { class: "vide__titre" }, "Le catalogue est vide"),
                    "Les premiers titres apparaîtront ici dès qu'ils seront ajoutés.",
                ),
            );
        } catch {
            if (!vivant) return;
            monter(rangees, h("div", { class: "vide" },
                h("div", { class: "vide__titre" }, "Catalogue indisponible"),
                "Le serveur n'a pas répondu. Réessaie dans un instant.",
            ));
        }
    })();

    return { element: conteneur, nettoyer: () => { vivant = false; } };
}

/** Bandeau du titre mis en avant. */
function banniere(media) {
    return h("section", { class: "banniere" },
        media.banner_url || media.poster_url
            ? h("img", {
                class: "banniere__fond",
                src: media.banner_url || media.poster_url,
                alt: "",
                fetchpriority: "high",
            })
            : null,
        h("div", { class: "banniere__contenu" },
            h("div", { class: "section__sur-titre" }, "À l'affiche"),
            h("h1", { class: "banniere__titre" }, media.title),
            media.description
                ? h("p", { class: "banniere__texte" }, media.description)
                : null,
            h("div", { class: "banniere__actions" },
                h("a", { class: "btn btn--principal btn--grand", href: `/lecture/${media.id}` }, "Regarder"),
                h("a", { class: "btn btn--contour btn--grand", href: `/titre/${media.id}` }, "Plus d'infos"),
            ),
        ),
    );
}
