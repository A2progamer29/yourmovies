/**
 * Format an error (typically from axios) into a human-readable message
 * with HTTP status code + backend `detail` field.
 *
 * Examples:
 *   describeError(err)  ->  "Erreur 401 · Invalid credentials"
 *   describeError(err)  ->  "Erreur 500 · Internal Server Error"
 *   describeError(err)  ->  "Erreur réseau · Impossible de joindre le serveur"
 */
export function describeError(err, fallback = "Une erreur est survenue") {
    if (!err) return fallback;

    // Network / CORS / no response
    if (err && err.isAxiosError && !err.response) {
        return `Erreur réseau · ${err.message || "Impossible de joindre le serveur"}`;
    }

    const resp = err.response;
    if (resp) {
        const status = resp.status;
        const data = resp.data;
        // FastAPI conventional shape: { "detail": "..." } OR { "detail": [{...}] } for 422
        let msg = null;
        if (data) {
            if (typeof data === "string") {
                msg = data;
            } else if (data.detail) {
                if (typeof data.detail === "string") {
                    msg = data.detail;
                } else if (Array.isArray(data.detail)) {
                    // Pydantic validation errors
                    msg = data.detail
                        .map((d) => {
                            const loc = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
                            return loc ? `${loc}: ${d.msg}` : d.msg;
                        })
                        .join(" · ");
                } else {
                    try { msg = JSON.stringify(data.detail); } catch { msg = String(data.detail); }
                }
            } else if (data.message) {
                msg = data.message;
            } else if (data.error) {
                msg = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
            }
        }
        if (!msg) msg = resp.statusText || fallback;
        return `Erreur ${status} · ${msg}`;
    }

    // Plain Error object
    if (err.message) return `Erreur · ${err.message}`;
    return fallback;
}

/**
 * Return the HTTP status code from an axios error, or null.
 */
export function errorCode(err) {
    return err?.response?.status ?? null;
}

/**
 * Toast an error, but only if the global axios interceptor hasn't already
 * toasted the same error object. Use in local catch blocks for custom
 * fallback messages.
 */
export function showError(toast, err, fallback) {
    // Les limitations temporaires restent silencieuses, y compris pour les
    // requêtes axios qui n'utilisent pas l'instance API globale.
    if (err?.__silent || errorCode(err) === 429) return;
    if (err && err.__globalToasted) return;
    if (!toast || typeof toast.error !== "function") return;
    toast.error(describeError(err, fallback));
}
