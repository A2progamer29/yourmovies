import { api } from "@/lib/api";

const CACHE_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;
let inFlight = null;

export const EMPTY_ADS = {
    enabled: false,
    preroll: { enabled: false, vast_tag_url: "", duration: 15, skip_after: 5, frequency_minutes: 30 },
    banner: { enabled: false, script_url: "" },
    popunder: { enabled: false, script_url: "", frequency_hours: 12 },
    campaigns: [],
};

export function adsAllowed(user) {
    return !user?.premium;
}

export async function loadAdsConfig() {
    const now = Date.now();
    if (cached && now - cachedAt < CACHE_MS) return cached;
    if (inFlight) return inFlight;
    inFlight = api.get("/ads/config", { silent: true })
        .then((r) => {
            cached = r.data && typeof r.data === "object" ? r.data : EMPTY_ADS;
            cachedAt = Date.now();
            return cached;
        })
        .catch(() => EMPTY_ADS)
        .finally(() => { inFlight = null; });
    return inFlight;
}

function readStamp(key) {
    try {
        const raw = window.localStorage.getItem(key);
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    } catch { return 0; }
}

function writeStamp(key) {
    try { window.localStorage.setItem(key, String(Date.now())); } catch { }
}

/** true si le plafond de fréquence autorise un nouvel affichage. */
export function frequencyAllows(key, minutes) {
    if (!minutes || minutes <= 0) return true;
    return Date.now() - readStamp(key) >= minutes * 60 * 1000;
}

export function markShown(key) {
    writeStamp(key);
}

/** Injecte un script tiers une seule fois par page. */
export function injectScript(url, target) {
    if (!url) return null;
    const host = target || document.body;
    const existing = host.querySelector(`script[src="${url}"]`);
    if (existing) return existing;
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    host.appendChild(script);
    return script;
}

/**
 * Parse minimal d'un tag VAST 2/3 linéaire.
 * Retourne { mediaUrl, clickThrough, impressions[] } ou null.
 */
export async function fetchVast(tagUrl) {
    if (!tagUrl) return null;
    try {
        const url = tagUrl.replace(/\[?(CACHEBUSTER|cachebuster)\]?/g, String(Date.now()));
        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) return null;
        const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
        if (xml.querySelector("parsererror")) return null;

        const files = Array.from(xml.querySelectorAll("MediaFile"))
            .map((node) => ({
                url: (node.textContent || "").trim(),
                type: (node.getAttribute("type") || "").toLowerCase(),
                width: Number(node.getAttribute("width")) || 0,
            }))
            .filter((f) => f.url.startsWith("https://") && f.type.includes("mp4"))
            .sort((a, b) => a.width - b.width);
        const media = files.find((f) => f.width >= 640) || files[0];
        if (!media) return null;

        const clickNode = xml.querySelector("ClickThrough");
        const impressions = Array.from(xml.querySelectorAll("Impression"))
            .map((n) => (n.textContent || "").trim())
            .filter((u) => u.startsWith("https://"));

        return {
            mediaUrl: media.url,
            clickThrough: (clickNode?.textContent || "").trim(),
            impressions,
        };
    } catch {
        return null;
    }
}

export function fireTrackers(urls) {
    (urls || []).forEach((u) => {
        try {
            const img = new Image();
            img.referrerPolicy = "no-referrer";
            img.src = u;
        } catch { }
    });
}
