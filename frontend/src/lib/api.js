import axios from "axios";
import { toast } from "sonner";
import { describeError } from "@/lib/errors";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// Inject JWT token if present
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("ym_token");
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
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
        const silentUrls = ["/auth/me", "/favorites/status/", "/watch-progress"];
        const isSilentUrl = silentUrls.some((u) => url.includes(u)) && status === 401;
        if (cfg.silent === true || isSilentUrl) {
            return Promise.reject(err);
        }
        // Attach a flag so locals can detect and skip
        err.__globalToasted = true;
        try { toast.error(describeError(err)); } catch { }
        return Promise.reject(err);
    },
);
