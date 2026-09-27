/** Accès au stockage du navigateur, jamais bloquants.
 *
 *  Lire `localStorage` ou `sessionStorage` lève une exception, et non `null`,
 *  quand les données de site sont refusées : navigation privée stricte, cookies
 *  bloqués, navigateur intégré à une application. Une seule lecture non protégée
 *  dans le rendu suffit alors à faire tomber le site entier.
 *
 *  Un relais en mémoire prend le relais quand le navigateur refuse. Il ne
 *  survit pas à un rechargement — rien ne le peut sans stockage — mais il tient
 *  le temps de la visite, ce qui suffit à rester connecté et à lire une vidéo.
 *  Sans lui, le jeton de connexion et la preuve de vérification se perdaient
 *  d'un appel à l'autre et la lecture était refusée à des gens légitimes.
 */

const memoire = { local: new Map(), session: new Map() };

function coffre(session) {
    try {
        const magasin = session ? window.sessionStorage : window.localStorage;
        // Certains navigateurs exposent l'objet mais refusent l'écriture : on
        // s'en assure ici plutôt que de le découvrir à la première sauvegarde.
        const sonde = "__ym__";
        magasin.setItem(sonde, "1");
        magasin.removeItem(sonde);
        return magasin;
    } catch {
        return null;
    }
}

function relais(session) {
    return session ? memoire.session : memoire.local;
}

function lire(session, cle) {
    const magasin = coffre(session);
    if (magasin) {
        try {
            const valeur = magasin.getItem(cle);
            if (valeur !== null) return valeur;
        } catch {
            // on retombe sur le relais
        }
    }
    return relais(session).has(cle) ? relais(session).get(cle) : null;
}

function ecrire(session, cle, valeur) {
    const texte = String(valeur);
    relais(session).set(cle, texte);
    const magasin = coffre(session);
    if (!magasin) return false;
    try {
        magasin.setItem(cle, texte);
        return true;
    } catch {
        return false;
    }
}

function supprimer(session, cle) {
    relais(session).delete(cle);
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
