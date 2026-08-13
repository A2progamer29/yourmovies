import axios from "axios";
import { toast } from "sonner";
import { describeError } from "@/lib/errors";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// Inject JWT token + active profile if present
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("ym_token");
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    const profileId = localStorage.getItem("ym_profile_id");
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
