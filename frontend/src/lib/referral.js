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
