import { api, API } from "@/lib/api";
import { ecrireLocal, lireLocal, supprimerLocal } from "@/lib/stockage";

export const OFFLINE_DATABASE = "yourmovies-offline-v1";
export const OFFLINE_PREFIX = "/_ym-offline/";
const INDEX_KEY = "ym_offline_downloads_v1";
const SESSION_KEY = "ym_offline_premium_session_v1";
const DATABASE_VERSION = 1;

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Stockage local indisponible"));
    });
}

function openDatabase() {
    if (typeof indexedDB === "undefined") {
        return Promise.reject(new Error("Ce navigateur ne permet pas le stockage hors connexion."));
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(OFFLINE_DATABASE, DATABASE_VERSION);
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
        request.onerror = () => reject(request.error || new Error("Impossible d’ouvrir le stockage hors connexion."));
        request.onblocked = () => reject(new Error("Fermez les autres onglets pour activer le mode hors connexion."));
    });
}

async function readStore(name, key) {
    const database = await openDatabase();
    return requestResult(database.transaction(name, "readonly").objectStore(name).get(key));
}

async function putStore(name, value) {
    const database = await openDatabase();
    return requestResult(database.transaction(name, "readwrite").objectStore(name).put(value));
}

async function allFromStore(name) {
    const database = await openDatabase();
    return requestResult(database.transaction(name, "readonly").objectStore(name).getAll());
}

async function deleteStore(name, key) {
    const database = await openDatabase();
    return requestResult(database.transaction(name, "readwrite").objectStore(name).delete(key));
}

export function hasPremiumOfflineAccess(user) {
    if (!user?.premium || !["premium", "admin"].includes(String(user.premium_plan || "").toLowerCase())) {
        return false;
    }
    const expiration = Date.parse(user.premium_until || "");
    return Number.isFinite(expiration) && expiration > Date.now();
}

export function savePremiumOfflineSession(user) {
    if (!hasPremiumOfflineAccess(user)) {
        supprimerLocal(SESSION_KEY);
        return false;
    }
    return ecrireLocal(SESSION_KEY, JSON.stringify({ user, saved_at: new Date().toISOString() }));
}

export function readPremiumOfflineSession() {
    try {
        const session = JSON.parse(lireLocal(SESSION_KEY) || "null");
        return hasPremiumOfflineAccess(session?.user) ? session.user : null;
    } catch {
        return null;
    }
}

export function clearPremiumOfflineSession() {
    supprimerLocal(SESSION_KEY);
}

export function makeDownloadId(mediaId, episode, userId) {
    const season = episode?.season_number ?? "movie";
    const number = episode?.ep_number ?? episode?.episode_number ?? "0";
    return `${userId}--${mediaId}--${season}--${number}`;
}

function summarizeDownload(download) {
    const { media, ...summary } = download;
    return summary;
}

async function refreshLocalIndex(userId) {
    const downloads = await allFromStore("downloads");
    const selected = downloads.filter((item) => item.user_id === userId && item.status === "ready");
    ecrireLocal(INDEX_KEY, JSON.stringify(selected.map(summarizeDownload)));
    return selected.sort((first, second) => Date.parse(second.downloaded_at) - Date.parse(first.downloaded_at));
}

export function readLocalDownloadIndex(userId) {
    try {
        return JSON.parse(lireLocal(INDEX_KEY) || "[]")
            .filter((download) => download.user_id === userId)
            .sort((first, second) => Date.parse(second.downloaded_at) - Date.parse(first.downloaded_at));
    } catch {
        return [];
    }
}

export async function listOfflineDownloads(userId) {
    if (!userId) return [];
    return refreshLocalIndex(userId);
}

export async function getOfflineDownload(downloadId, userId) {
    const download = await readStore("downloads", downloadId);
    return download?.user_id === userId && download.status === "ready" ? download : null;
}

export async function findOfflineMedia(mediaId, userId) {
    const downloads = await allFromStore("downloads");
    return downloads.find((item) => item.user_id === userId && item.media_id === mediaId && item.status === "ready")?.media || null;
}

async function saveAsset(downloadId, name, blob, contentType = blob.type || "application/octet-stream") {
    await putStore("assets", {
        key: `${downloadId}/${name}`,
        download_id: downloadId,
        blob,
        content_type: contentType,
        size: blob.size,
    });
    return blob.size;
}

async function deleteDownloadAssets(downloadId) {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
        const transaction = database.transaction("assets", "readwrite");
        const index = transaction.objectStore("assets").index("download_id");
        const cursor = index.openKeyCursor(IDBKeyRange.only(downloadId));
        cursor.onsuccess = () => {
            if (!cursor.result) return;
            transaction.objectStore("assets").delete(cursor.result.primaryKey);
            cursor.result.continue();
        };
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Suppression impossible"));
        transaction.onabort = () => reject(transaction.error || new Error("Suppression interrompue"));
    });
}

export async function removeOfflineDownload(downloadId, userId) {
    const download = await readStore("downloads", downloadId);
    if (!download || download.user_id !== userId) return;
    await deleteDownloadAssets(downloadId);
    await deleteStore("downloads", downloadId);
    await refreshLocalIndex(userId);
}

export async function clearOfflineDownloads() {
    supprimerLocal(INDEX_KEY);
    clearPremiumOfflineSession();
    try {
        const database = await openDatabase();
        await Promise.all(["downloads", "assets", "settings"].map((name) =>
            requestResult(database.transaction(name, "readwrite").objectStore(name).clear())
        ));
    } catch {
        // Un navigateur qui refuse IndexedDB n’a rien de persistant à nettoyer.
    }
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.controller?.postMessage({ type: "YM_CLEAR_OFFLINE" });
        navigator.serviceWorker.getRegistration("/").then((registration) => {
            registration?.active?.postMessage({ type: "YM_CLEAR_OFFLINE" });
        }).catch(() => {});
    }
}

export async function getOfflineStorageEstimate() {
    if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage || 0, quota: estimate.quota || 0 };
}

function resourcesToCache() {
    const resourceUrls = performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => {
            try { return new URL(url).origin === window.location.origin; } catch { return false; }
        });
    return [...new Set(["/", "/index.html", "/settings?tab=downloads", ...resourceUrls])];
}

function sendWorkerConfiguration(registration, user) {
    const message = {
        type: "YM_ENABLE_OFFLINE",
        entitlement: { user_id: user.user_id, expires_at: user.premium_until, api_origin: new URL(API).origin },
        resources: resourcesToCache(),
    };
    registration.active?.postMessage(message);
    registration.waiting?.postMessage(message);
    navigator.serviceWorker.controller?.postMessage(message);
}

export async function enablePremiumOffline(user) {
    if (!hasPremiumOfflineAccess(user)) throw new Error("Le mode hors connexion est réservé à la formule Premium.");
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
        throw new Error("Le mode hors connexion nécessite un navigateur récent et une connexion sécurisée.");
    }

    savePremiumOfflineSession(user);
    await putStore("settings", {
        key: "entitlement",
        user_id: user.user_id,
        expires_at: user.premium_until,
        api_origin: new URL(API).origin,
    });

    const existing = await navigator.serviceWorker.getRegistration("/");
    if (!existing && !navigator.onLine) {
        throw new Error("Reconnectez-vous une première fois pour préparer le mode hors connexion.");
    }
    const registration = existing || await navigator.serviceWorker.register("/offline-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
            const timeout = window.setTimeout(resolve, 1800);
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                window.clearTimeout(timeout);
                resolve();
            }, { once: true });
        });
    }

    // La lecture HLS charge son moteur à la demande : il faut le récupérer tant
    // que le réseau existe, puis l’inclure dans les fichiers mis en cache.
    await import("hls.js");
    sendWorkerConfiguration(registration, user);
    navigator.storage?.persist?.().catch(() => {});
    return registration;
}

function resolvePlaylistUrl(value, parentUrl) {
    const resolved = new URL(value, parentUrl);
    const parent = new URL(parentUrl);
    if (!resolved.search && parent.search && resolved.origin === parent.origin) {
        resolved.search = parent.search;
    }
    return resolved.toString();
}

async function fetchSource(url, signal) {
    const credentials = new URL(url).origin === new URL(API).origin ? "include" : "omit";
    const response = await fetch(url, { credentials, cache: "no-store", signal });
    if (!response.ok) throw new Error(`La vidéo n’est pas téléchargeable pour le moment (${response.status}).`);
    return response;
}

function choosePlaylist(master, masterUrl) {
    const lines = master.split(/\r?\n/);
    const variants = [];
    for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
        const next = lines.slice(index + 1).find((line) => line.trim() && !line.startsWith("#"));
        if (!next) continue;
        const resolution = lines[index].match(/RESOLUTION=\d+x(\d+)/);
        const bandwidth = lines[index].match(/BANDWIDTH=(\d+)/);
        variants.push({
            url: resolvePlaylistUrl(next.trim(), masterUrl),
            height: Number(resolution?.[1] || 0),
            bandwidth: Number(bandwidth?.[1] || 0),
        });
    }
    if (!variants.length) return null;
    const compact = variants.filter((variant) => variant.height > 0 && variant.height <= 720);
    const candidates = compact.length ? compact : variants;
    return candidates.sort((first, second) => (second.height - first.height) || (second.bandwidth - first.bandwidth))[0];
}

async function storePlaylist(downloadId, sourceUrl, notifyProgress, signal) {
    const initial = await fetchSource(sourceUrl, signal);
    const initialText = await initial.text();
    const selected = choosePlaylist(initialText, sourceUrl);
    const playlistUrl = selected?.url || sourceUrl;
    const playlistText = selected ? await (await fetchSource(playlistUrl, signal)).text() : initialText;

    if (!playlistText.includes("#EXTM3U")) {
        throw new Error("Le lecteur n’a pas fourni une playlist vidéo valide.");
    }

    const lines = playlistText.split(/\r?\n/);
    const assets = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        if (!line.startsWith("#")) {
            const name = `segment-${assets.length}`;
            assets.push({ name, url: resolvePlaylistUrl(line, playlistUrl), lineIndex: index, attribute: false });
        } else if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-MAP:") || line.startsWith("#EXT-X-MEDIA:")) {
            const match = line.match(/URI="([^"]+)"/);
            if (!match) continue;
            const name = `${line.startsWith("#EXT-X-KEY:") ? "key" : "map"}-${assets.length}`;
            assets.push({ name, url: resolvePlaylistUrl(match[1], playlistUrl), lineIndex: index, attribute: true, original: match[1] });
        }
    }
    if (!assets.length) throw new Error("Aucun segment vidéo n’est disponible pour ce titre.");

    let nextAsset = 0;
    let completed = 0;
    let bytes = 0;
    const workers = Array.from({ length: Math.min(4, assets.length) }, async () => {
        while (nextAsset < assets.length) {
            if (signal?.aborted) throw new DOMException("Téléchargement annulé", "AbortError");
            const current = assets[nextAsset];
            nextAsset += 1;
            const response = await fetchSource(current.url, signal);
            const blob = await response.blob();
            bytes += await saveAsset(downloadId, current.name, blob, response.headers.get("content-type") || blob.type);
            const localUrl = `${OFFLINE_PREFIX}${encodeURIComponent(downloadId)}/${current.name}`;
            lines[current.lineIndex] = current.attribute
                ? lines[current.lineIndex].replace(`URI="${current.original}"`, `URI="${localUrl}"`)
                : localUrl;
            completed += 1;
            notifyProgress({ percent: Math.round((completed / assets.length) * 96), bytes, completed, total: assets.length });
        }
    });
    await Promise.all(workers);

    const manifest = new Blob([lines.join("\n")], { type: "application/vnd.apple.mpegurl" });
    bytes += await saveAsset(downloadId, "manifest.m3u8", manifest, manifest.type);
    return { kind: "hls", quality: selected?.height ? `${selected.height}p` : "720p", size_bytes: bytes };
}

async function storeVideoFile(downloadId, sourceUrl, notifyProgress, signal) {
    const response = await fetchSource(sourceUrl, signal);
    const expected = Number(response.headers.get("content-length") || 0);
    let blob;

    if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let bytes = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            bytes += value.byteLength;
            notifyProgress({ percent: expected ? Math.min(96, Math.round((bytes / expected) * 96)) : null, bytes, total_bytes: expected });
        }
        blob = new Blob(chunks, { type: response.headers.get("content-type") || "video/mp4" });
    } else {
        blob = await response.blob();
    }

    const bytes = await saveAsset(downloadId, "video.mp4", blob, blob.type || "video/mp4");
    return { kind: "file", quality: "720p", size_bytes: bytes };
}

async function savePoster(downloadId, media) {
    const image = media.poster_url || media.banner_url;
    if (!image) return null;
    try {
        const response = await fetch(image, { cache: "force-cache" });
        if (!response.ok) return null;
        const blob = await response.blob();
        await saveAsset(downloadId, "poster", blob, blob.type || "image/jpeg");
        return `${OFFLINE_PREFIX}${encodeURIComponent(downloadId)}/poster`;
    } catch {
        return null;
    }
}

export async function createOfflineDownload({ media, episode = null, user, activeProfile = null, onProgress = () => {}, signal = null }) {
    if (!hasPremiumOfflineAccess(user)) throw new Error("Le téléchargement est réservé à la formule Premium.");
    if (!navigator.onLine) throw new Error("Reconnectez-vous pour télécharger un contenu.");

    await enablePremiumOffline(user);
    const downloadId = makeDownloadId(media.id, episode, user.user_id);
    const previous = await readStore("downloads", downloadId);
    if (previous?.status === "ready") return previous;

    const parameters = {};
    if (episode) {
        parameters.season_number = episode.season_number;
        parameters.episode_number = episode.ep_number ?? episode.episode_number;
    }
    const response = await api.get(`/offline/${media.id}/source`, { params: parameters, silent: true });
    const payload = response.data;
    onProgress({ percent: 0, bytes: 0 });

    try {
        const stored = payload.source.kind === "hls"
            ? await storePlaylist(downloadId, payload.source.url, onProgress, signal)
            : await storeVideoFile(downloadId, payload.source.url, onProgress, signal);
        const poster = await savePoster(downloadId, media);
        const download = {
            id: downloadId,
            user_id: user.user_id,
            profile_id: activeProfile?.id || null,
            media_id: media.id,
            media,
            type: media.type,
            title: media.title,
            episode_title: episode?.title || null,
            season_number: episode?.season_number ?? null,
            episode_number: episode?.ep_number ?? episode?.episode_number ?? null,
            poster_url: poster,
            duration_minutes: Number(episode?.duration || media.duration_minutes || 0) || null,
            downloaded_at: new Date().toISOString(),
            premium_until: user.premium_until,
            status: "ready",
            ...stored,
        };
        await putStore("downloads", download);
        await refreshLocalIndex(user.user_id);
        onProgress({ percent: 100, bytes: download.size_bytes });
        return download;
    } catch (error) {
        await deleteDownloadAssets(downloadId).catch(() => {});
        await deleteStore("downloads", downloadId).catch(() => {});
        if (error?.name === "QuotaExceededError") {
            throw new Error("L’espace disponible dans ce navigateur est insuffisant. Supprimez un téléchargement puis réessayez.");
        }
        throw error;
    }
}

export function offlinePlaybackUrl(download) {
    const filename = download.kind === "hls" ? "manifest.m3u8" : "video.mp4";
    return `${OFFLINE_PREFIX}${encodeURIComponent(download.id)}/${filename}`;
}

export function formatOfflineSize(bytes) {
    if (!bytes || bytes < 0) return "0 o";
    if (bytes < 1024) return `${Math.round(bytes)} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} Mo`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(".", ",")} Go`;
}

export function formatOfflineRate(bytesPerSecond) {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "Calcul du débit…";
    return `${formatOfflineSize(bytesPerSecond)}/s`;
}
