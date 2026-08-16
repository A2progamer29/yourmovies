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
