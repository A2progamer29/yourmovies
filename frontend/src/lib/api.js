import axios from "axios";
import { lireLocal } from "@/lib/stockage";
import { toast } from "sonner";
import { describeError } from "@/lib/errors";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
    // Sans timeout, une requête bloquée (API externe lente, réveil du serveur)
    // tournait indéfiniment : le bouton restait sur "chargement" pour
    // toujours, sans jamais basculer sur le message d'erreur existant.
    timeout: 45000,
});


// ---------- Détection d'une attente anormalement longue ----------
// L'hébergement du serveur le met en veille : le premier appel après une
// période creuse peut prendre près d'une minute. Plutôt que de laisser
// quelqu'un devant une animation qui tourne sans fin, on expose l'attente en
// cours pour pouvoir l'avertir et lui proposer de l'aide.
const requetesEnCours = new Map();
const abonnes = new Set();
let compteurRequetes = 0;

function debutLePlusAncien() {
    let debut = null;
    for (const instant of requetesEnCours.values()) {
        if (debut === null || instant < debut) debut = instant;
    }
    return debut;
}

function prevenirAbonnes() {
    const debut = debutLePlusAncien();
    for (const abonne of abonnes) {
        try { abonne(debut); } catch { }
    }
}

/** S'abonne à l'attente réseau. Reçoit l'instant de départ de la plus ancienne
 *  requête en cours, ou null quand plus rien n'est en attente. */
export function surAttenteReseau(abonne) {
    abonnes.add(abonne);
    abonne(debutLePlusAncien());
    return () => abonnes.delete(abonne);
}

function marquerDebut(config) {
    config.__suivi = ++compteurRequetes;
    requetesEnCours.set(config.__suivi, Date.now());
    prevenirAbonnes();
    return config;
}

function marquerFin(config) {
    const cle = config?.__suivi;
    if (cle && requetesEnCours.delete(cle)) prevenirAbonnes();
}

api.interceptors.request.use(marquerDebut);
api.interceptors.response.use(
    (reponse) => { marquerFin(reponse.config); return reponse; },
    (erreur) => { marquerFin(erreur?.config); return Promise.reject(erreur); },
);

// Inject JWT token + active profile if present
api.interceptors.request.use((config) => {
    const token = lireLocal("ym_token");
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    const profileId = lireLocal("ym_profile_id");
    if (profileId) {
        config.headers = config.headers || {};
        config.headers["X-Profile-Id"] = profileId;
    }
    return config;
});

// Global response interceptor — surface backend error details for requests that
// don't explicitly handle them locally. To opt out per-call, set config.silent = true.
// Callers that already display their own toast should set config.silent = true to
// avoid duplicate messages.
api.interceptors.response.use(
    (r) => r,
    (err) => {
        const cfg = err?.config || {};
        const status = err?.response?.status;
        const url = cfg.url || "";
        // Silent probes: 401 during /auth/me, /favorites/status/*, /watch-progress on load
        const silentUrls = ["/auth/me", "/favorites/status/", "/watch-progress", "/bunny/video-status/"];
        const isSilentUrl = silentUrls.some((u) => url.includes(u)) && status === 401;

        // Une limitation temporaire est gérée par l'appelant (notamment le suivi
        // un hébergeur qui respecte Retry-After). Elle ne doit jamais exposer le code
        // technique 429 ni déclencher une notification utilisateur.
        if (status === 429) {
            err.__silent = true;
            err.__globalToasted = true;
            return Promise.reject(err);
        }

        if (cfg.silent === true || isSilentUrl) {
            return Promise.reject(err);
        }
        // Attach a flag so locals can detect and skip
        err.__globalToasted = true;
        try { toast.error(describeError(err)); } catch { }
        return Promise.reject(err);
    },
);