const CLE = "ym_playback_pass";

/** Preuve de vérification anti-robots. Elle vit le temps de la session : une
 *  personne ne repasse pas la vérification à chaque épisode, mais un robot qui
 *  ouvre une session neuve devra la franchir. */
export function lirePass() {
    try {
        return window.sessionStorage.getItem(CLE) || null;
    } catch {
        return null;
    }
}

export function ecrirePass(valeur) {
    try {
        if (valeur) window.sessionStorage.setItem(CLE, valeur);
    } catch {
        // sans effet
    }
}

export function effacerPass() {
    try {
        window.sessionStorage.removeItem(CLE);
    } catch {
        // sans effet
    }
}
