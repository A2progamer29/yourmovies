import { lireSession, ecrireSession, supprimerSession } from "@/lib/stockage";

const CLE = "ym_playback_pass";

/** Preuve de vérification anti-robots. Elle vit le temps de la session : une
 *  personne ne repasse pas la vérification à chaque épisode, mais un robot qui
 *  ouvre une session neuve devra la franchir.
 *
 *  Le passage par le module de stockage n'est pas cosmétique : quand le
 *  navigateur refuse les données de site, la preuve se perdait entre la
 *  vérification et l'appel de lecture, et le serveur refusait la vidéo à
 *  quelqu'un qui venait pourtant de la franchir. */
export function lirePass() {
    return lireSession(CLE);
}

export function ecrirePass(valeur) {
    if (valeur) ecrireSession(CLE, valeur);
}

export function effacerPass() {
    supprimerSession(CLE);
}
