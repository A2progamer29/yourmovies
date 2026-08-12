const CLE = "ym_voter_key";

/** Identifiant tiré au sort dans le navigateur : il permet à un visiteur non
 *  connecté de voter une seule fois, sans lui demander de compte. */
export function voterKey() {
    try {
        let valeur = window.localStorage.getItem(CLE);
        if (!valeur || valeur.length < 8) {
            valeur = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
                .replace(/[^A-Za-z0-9_-]/g, "");
            window.localStorage.setItem(CLE, valeur);
        }
        return valeur;
    } catch {
        return "";
    }
}
