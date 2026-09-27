import { h, monter, trouve } from "./core/dom.js";
import { definirRoutes, demarrerRouteur } from "./core/routeur.js";
import { api } from "./core/http.js";
import { compte, reglages } from "./core/etat.js";
import { lireLocal } from "./core/stockage.js";
import { entete } from "./components/entete.js";

/**
 * Point d'entrée. Les pages sont chargées à la demande : la page
 * d'accueil n'embarque pas le panneau d'administration, qui pèse le
 * plus lourd et ne sert qu'à quelques comptes.
 */

definirRoutes([
    { chemin: "/", titre: null, vue: () => import("./pages/accueil.js").then((m) => m.pageAccueil()) },
    { chemin: "*", titre: "Introuvable", vue: () => import("./pages/introuvable.js").then((m) => m.pageIntrouvable()) },
]);

async function amorcer() {
    const racine = trouve("#app");
    const vue = h("main", { id: "vue" });
    monter(racine, entete(), vue);

    demarrerRouteur(vue);

    // Le compte et les réglages publics partent ensemble : ni l'un ni
    // l'autre ne doit retarder l'affichage du catalogue.
    const jeton = lireLocal("ym_token");
    if (!jeton) compte.ecrire(null);

    Promise.allSettled([
        jeton ? api.get("/auth/me") : Promise.resolve(null),
        api.get("/ads/config"),
    ]).then(([moi, pub]) => {
        compte.ecrire(moi.status === "fulfilled" ? moi.value : null);
        if (pub.status === "fulfilled") reglages.ecrire((actuels) => ({ ...actuels, ads: pub.value }));
    });
}

amorcer();
