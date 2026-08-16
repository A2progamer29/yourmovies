/** Accès au stockage du navigateur, jamais bloquants.
 *
 *  Lire `localStorage` ou `sessionStorage` lève une exception, et non `null`,
 *  quand les données de site sont refusées : navigation privée stricte, blocage
 *  des cookies, navigateur intégré à une application. Une seule lecture non
 *  protégée dans le rendu suffit alors à faire tomber le site entier.
 *
 *  Toute écriture perdue est sans conséquence : ces valeurs sont du confort —
 *  un jeton, une préférence, un message déjà vu — jamais une donnée à conserver.
 */

function coffre(session) {
    try {
        return session ? window.sessionStorage : window.localStorage;
    } catch {
        return null;
    }
}

function lire(session, cle) {
    try {
        return coffre(session)?.getItem(cle) ?? null;
    } catch {
        return null;
    }
}

function ecrire(session, cle, valeur) {
    // Le coffre absent doit répondre « non écrit » : avec un appel optionnel,
    // l'écriture était silencieusement sautée et annoncée comme réussie.
    const magasin = coffre(session);
    if (!magasin) return false;
    try {
        magasin.setItem(cle, String(valeur));
        return true;
    } catch {
        return false;
    }
}

function supprimer(session, cle) {
    try {
        coffre(session)?.removeItem(cle);
    } catch {
        // sans effet
    }
}

export const lireLocal = (cle) => lire(false, cle);
export const ecrireLocal = (cle, valeur) => ecrire(false, cle, valeur);
export const supprimerLocal = (cle) => supprimer(false, cle);

export const lireSession = (cle) => lire(true, cle);
export const ecrireSession = (cle, valeur) => ecrire(true, cle, valeur);
export const supprimerSession = (cle) => supprimer(true, cle);
