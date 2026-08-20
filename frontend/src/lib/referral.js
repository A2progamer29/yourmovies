const CLE = "ym_ref";

/** Le code du parrain arrive dans l'URL et doit survivre à la navigation :
 *  quelqu'un ouvre le lien, visite le catalogue, puis s'inscrit plus tard. */
export function captureRef() {
    try {
        const code = new URLSearchParams(window.location.search).get("ref");
        const propre = (code || "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
        if (propre) window.localStorage.setItem(CLE, propre);
    } catch {
        // Un parrainage perdu ne doit jamais empêcher la navigation.
    }
}

/** Code saisi à la main sur la page d'inscription. Il suit le même chemin qu'un
 *  code reçu par lien, pour que l'inscription Google en profite aussi. */
export function enregistrerRef(code) {
    const propre = (code || "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
    try {
        if (propre) window.localStorage.setItem(CLE, propre);
        else window.localStorage.removeItem(CLE);
    } catch {
        // sans effet
    }
    return propre;
}

/** Code applicable maintenant : celui de l'URL s'il y en a un, sinon celui deja
 *  memorise. La capture se fait apres le premier rendu, si bien qu'une page lue
 *  au chargement ne verrait pas encore le code de l'adresse. */
export function refCodeCourant() {
    try {
        const url = new URLSearchParams(window.location.search).get("ref");
        const propre = (url || "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
        if (propre) return propre;
    } catch {
        // on retombe sur ce qui est memorise
    }
    return refCode() || "";
}

export function refCode() {
    try {
        return window.localStorage.getItem(CLE) || null;
    } catch {
        return null;
    }
}

export function clearRef() {
    try {
        window.localStorage.removeItem(CLE);
    } catch {
        // sans effet
    }
}
