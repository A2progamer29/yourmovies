/* Le cache de navigation et les vidéos locales sont réservés à un abonnement
 * Premium actif. Sans droit valide, ce service worker ne sert aucun contenu. */
const DATABASE_NAME = "yourmovies-offline-v1";
const CACHE_NAME = "yourmovies-premium-pages-v1";
const OFFLINE_PREFIX = "/_ym-offline/";

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains("downloads")) {
                const downloads = database.createObjectStore("downloads", { keyPath: "id" });
                downloads.createIndex("user_id", "user_id", { unique: false });
                downloads.createIndex("media_id", "media_id", { unique: false });
            }
            if (!database.objectStoreNames.contains("assets")) {
                const assets = database.createObjectStore("assets", { keyPath: "key" });
                assets.createIndex("download_id", "download_id", { unique: false });
            }
            if (!database.objectStoreNames.contains("settings")) {
                database.createObjectStore("settings", { keyPath: "key" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getStored(name, key) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const request = database.transaction(name, "readonly").objectStore(name).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function putStored(name, value) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const request = database.transaction(name, "readwrite").objectStore(name).put(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function validEntitlement() {
    try {
        const entitlement = await getStored("settings", "entitlement");
        if (!entitlement?.user_id || Date.parse(entitlement.expires_at || "") <= Date.now()) return null;
        if (!Number.isFinite(Date.parse(entitlement.expires_at || ""))) return null;
        return entitlement;
    } catch {
        return null;
    }
}

async function warmCache(resources) {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(resources.map(async (resource) => {
        const url = new URL(resource, self.location.origin);
        if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
        const response = await fetch(url.toString(), { cache: "reload" });
        if (response.ok) await cache.put(url.toString(), response);
    }));
}

self.addEventListener("message", (event) => {
    if (event.data?.type === "YM_ENABLE_OFFLINE") {
        event.waitUntil((async () => {
            const entitlement = event.data.entitlement;
            if (!entitlement?.user_id || Date.parse(entitlement.expires_at || "") <= Date.now()) return;
            await putStored("settings", { key: "entitlement", ...entitlement });
            await warmCache(event.data.resources || []);
        })());
    }
    if (event.data?.type === "YM_CLEAR_OFFLINE") {
        event.waitUntil(caches.delete(CACHE_NAME));
    }
});

async function serveVideo(request, url, entitlement) {
    if (!entitlement) return new Response("Abonnement Premium expiré", { status: 403 });
    const path = url.pathname.slice(OFFLINE_PREFIX.length).split("/");
    const downloadId = decodeURIComponent(path.shift() || "");
    const filename = path.join("/");
    const download = await getStored("downloads", downloadId);
    if (!download || download.user_id !== entitlement.user_id || download.status !== "ready") {
        return new Response("Téléchargement introuvable", { status: 404 });
    }
    const asset = await getStored("assets", `${downloadId}/${filename}`);
    if (!asset?.blob) return new Response("Fichier vidéo introuvable", { status: 404 });

    const headers = new Headers({
        "Content-Type": asset.content_type || asset.blob.type || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
    });
    const range = request.headers.get("range");
    if (!range) {
        headers.set("Content-Length", String(asset.blob.size));
        return new Response(asset.blob, { status: 200, headers });
    }

    const matches = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!matches || (!matches[1] && !matches[2])) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.blob.size}` } });
    }
    const suffix = !matches[1];
    const start = suffix ? Math.max(0, asset.blob.size - Number(matches[2])) : Number(matches[1]);
    const end = suffix || !matches[2] ? asset.blob.size - 1 : Math.min(Number(matches[2]), asset.blob.size - 1);
    if (start > end || start >= asset.blob.size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.blob.size}` } });
    }
    const slice = asset.blob.slice(start, end + 1, asset.content_type);
    headers.set("Content-Length", String(slice.size));
    headers.set("Content-Range", `bytes ${start}-${end}/${asset.blob.size}`);
    return new Response(slice, { status: 206, headers });
}

async function handleNavigation(request, entitlement) {
    if (!entitlement) return fetch(request);
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch {
        return (await cache.match(request))
            || (await cache.match("/"))
            || (await cache.match("/index.html"))
            || new Response("Cette page n’a pas encore été préparée pour le mode hors connexion.", { status: 503 });
    }
}

async function handleResource(request, entitlement) {
    if (!entitlement) return fetch(request);
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
}

function publicCatalogRequest(url, entitlement) {
    if (!entitlement?.api_origin || url.origin !== entitlement.api_origin) return false;
    return /^\/api\/(?:media(?:\/[^/]+(?:\/(?:reviews|similar|timeline))?)?|trending|genres|support-banner|plans)\/?$/.test(url.pathname);
}

async function handleCatalog(request, entitlement) {
    if (!entitlement) return fetch(request);
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    } catch (error) {
        const saved = await cache.match(request);
        if (saved) return saved;
        throw error;
    }
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        if (!url.pathname.startsWith("/api/")) return;
        event.respondWith(validEntitlement().then((entitlement) =>
            publicCatalogRequest(url, entitlement) ? handleCatalog(request, entitlement) : fetch(request)
        ));
        return;
    }
    if (url.pathname.startsWith("/api/")) return;

    if (url.pathname.startsWith(OFFLINE_PREFIX)) {
        event.respondWith(validEntitlement().then((entitlement) => serveVideo(request, url, entitlement)));
        return;
    }
    if (request.mode === "navigate") {
        event.respondWith(validEntitlement().then((entitlement) => handleNavigation(request, entitlement)));
        return;
    }
    if (["script", "style", "font", "image", "manifest"].includes(request.destination)) {
        event.respondWith(validEntitlement().then((entitlement) => handleResource(request, entitlement)));
    }
});
