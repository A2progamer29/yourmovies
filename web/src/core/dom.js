/**
 * Rendu. Quatre fonctions, pas de moteur de gabarits.
 *
 * Sans React il faut un moyen sûr de fabriquer du DOM. Concaténer du
 * HTML exposerait chaque titre de film venu de la base à l'injection ;
 * ici le texte passe toujours par `textContent`, jamais par `innerHTML`.
 */

/**
 * Crée un élément.
 *   h("div", { class: "carte" }, "texte", autreElement)
 * Les attributs commençant par « on » deviennent des écouteurs, `class`
 * accepte un tableau ou un objet conditionnel, et `style` un objet.
 */
export function h(balise, attributs = {}, ...enfants) {
    const element = document.createElement(balise);

    for (const [cle, valeur] of Object.entries(attributs || {})) {
        if (valeur === null || valeur === undefined || valeur === false) continue;

        if (cle === "class") {
            element.className = classes(valeur);
        } else if (cle === "style" && typeof valeur === "object") {
            Object.assign(element.style, valeur);
        } else if (cle === "dataset" && typeof valeur === "object") {
            Object.assign(element.dataset, valeur);
        } else if (cle.startsWith("on") && typeof valeur === "function") {
            element.addEventListener(cle.slice(2).toLowerCase(), valeur);
        } else if (cle === "html") {
            // Réservé au contenu que nous produisons nous-mêmes, jamais
            // à une valeur venue du serveur ou d'un formulaire.
            element.innerHTML = valeur;
        } else if (valeur === true) {
            element.setAttribute(cle, "");
        } else {
            element.setAttribute(cle, String(valeur));
        }
    }

    ajouter(element, enfants);
    return element;
}

function ajouter(parent, enfants) {
    for (const enfant of enfants.flat(Infinity)) {
        if (enfant === null || enfant === undefined || enfant === false) continue;
        parent.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
    }
}

/** Compose une liste de classes depuis une chaîne, un tableau ou un objet. */
export function classes(valeur) {
    if (typeof valeur === "string") return valeur;
    if (Array.isArray(valeur)) return valeur.filter(Boolean).map(classes).join(" ");
    if (valeur && typeof valeur === "object") {
        return Object.entries(valeur).filter(([, actif]) => actif).map(([nom]) => nom).join(" ");
    }
    return "";
}

/** Vide un conteneur puis y place le contenu donné. */
export function monter(conteneur, ...contenu) {
    conteneur.replaceChildren();
    ajouter(conteneur, contenu);
    return conteneur;
}

/** Fragment, pour renvoyer plusieurs éléments sans conteneur parasite. */
export function groupe(...enfants) {
    const fragment = document.createDocumentFragment();
    ajouter(fragment, enfants);
    return fragment;
}

/** Sélecteurs courts, pour éviter d'écrire document.querySelector partout. */
export const trouve = (selecteur, racine = document) => racine.querySelector(selecteur);
export const trouveTous = (selecteur, racine = document) => [...racine.querySelectorAll(selecteur)];

/**
 * Applique un délai de cascade à une liste.
 * Le plafond est volontaire : au-delà d'une douzaine d'éléments,
 * l'effet devient une attente au lieu d'une animation.
 */
export function cascader(elements, plafond = 12) {
    elements.forEach((element, index) => {
        element.style.setProperty("--rang", String(Math.min(index, plafond)));
    });
    return elements;
}
