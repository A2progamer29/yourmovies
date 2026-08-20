/* Vérifications autonomes : aucune installation ni accès réseau nécessaire. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const bundle = require(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright/lib/transform/babelBundle.js`);
const storage = new Map([["ym_token", "premium-token"]]);
const messages = [];
const databases = new Map();
let online = true;

function asynchronousRequest(action) {
    const request = { result: undefined, onsuccess: null, onerror: null };
    queueMicrotask(() => {
        try {
            request.result = action();
            request.onsuccess?.({ target: request });
        } catch (error) {
            request.error = error;
            request.onerror?.({ target: request });
        }
    });
    return request;
}

class FakeDatabase {
    constructor() {
        this.stores = new Map();
        this.objectStoreNames = { contains: (name) => this.stores.has(name) };
    }

    createObjectStore(name, options) {
        this.stores.set(name, { values: new Map(), keyPath: options.keyPath, indexes: new Map() });
        return { createIndex: (index, keyPath) => this.stores.get(name).indexes.set(index, keyPath) };
    }

    transaction(name) {
        const data = this.stores.get(name);
        if (!data) throw new Error(`Magasin ${name} introuvable`);
        const transaction = { oncomplete: null, onerror: null, onabort: null };
        transaction.objectStore = () => ({
            get: (key) => asynchronousRequest(() => data.values.get(key)),
            getAll: () => asynchronousRequest(() => Array.from(data.values.values())),
            put: (value) => asynchronousRequest(() => {
                const key = value[data.keyPath];
                data.values.set(key, value);
                return key;
            }),
            delete: (key) => asynchronousRequest(() => data.values.delete(key)),
            clear: () => asynchronousRequest(() => data.values.clear()),
            index: (indexName) => ({
                openKeyCursor: (range) => {
                    const field = data.indexes.get(indexName);
                    const keys = Array.from(data.values.entries())
                        .filter(([, value]) => value[field] === range.value)
                        .map(([key]) => key);
                    let index = 0;
                    const request = { result: null, onsuccess: null, onerror: null };
                    const advance = () => queueMicrotask(() => {
                        if (index >= keys.length) {
                            request.result = null;
                            request.onsuccess?.({ target: request });
                            queueMicrotask(() => transaction.oncomplete?.());
                            return;
                        }
                        const key = keys[index++];
                        request.result = { primaryKey: key, continue: advance };
                        request.onsuccess?.({ target: request });
                    });
                    advance();
                    return request;
                },
            }),
        });
        return transaction;
    }
}

const indexedDB = {
    open(name) {
        const request = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
        queueMicrotask(() => {
            let database = databases.get(name);
            if (!database) {
                database = new FakeDatabase();
                databases.set(name, database);
                request.result = database;
                request.onupgradeneeded?.({ target: request });
            }
            request.result = database;
            request.onsuccess?.({ target: request });
        });
        return request;
    },
};

const masterUrl = "https://cdn.example.test/video/playlist.m3u8?token=allowed";
const media = {
    id: "series-42",
    title: "La série Premium",
    type: "series",
    poster_url: "https://images.example.test/poster.jpg",
    description: "Une aventure hors connexion.",
    seasons: [{ season_number: 1, episodes: [{ ep_number: 2, title: "Le départ" }] }],
};
const premium = {
    user_id: "viewer-1",
    premium: true,
    premium_plan: "premium",
    premium_until: new Date(Date.now() + 86_400_000).toISOString(),
    name: "Premium",
};

const requestedUrls = [];
async function mockFetch(input) {
    const url = typeof input === "string" ? input : input.url;
    requestedUrls.push(url);
    if (!online) throw new Error("Réseau indisponible");
    if (url === masterUrl) {
        return new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n720/stream.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\n1080/stream.m3u8\n");
    }
    if (url === "https://cdn.example.test/video/720/stream.m3u8?token=allowed") {
        return new Response("#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:5,\nfirst.ts\n#EXTINF:5,\nsecond.ts\n#EXT-X-ENDLIST\n");
    }
    if (url.endsWith("first.ts?token=allowed")) return new Response("segment-one", { headers: { "content-type": "video/mp2t" } });
    if (url.endsWith("second.ts?token=allowed")) return new Response("segment-two", { headers: { "content-type": "video/mp2t" } });
    if (url === "https://images.example.test/poster.jpg") return new Response("poster", { headers: { "content-type": "image/jpeg" } });
    if (url === "https://cdn.example.test/movie.mp4") return new Response("0123456789", { headers: { "content-type": "video/mp4", "content-length": "10" } });
    return new Response("<!doctype html><title>YourMovie’s</title>", { headers: { "content-type": "text/html" } });
}

const apiCalls = [];
const api = {
    get: async (route, options) => {
        apiCalls.push({ route, options });
        return {
            data: {
                source: route.includes("movie-direct")
                    ? { kind: "file", url: "https://cdn.example.test/movie.mp4" }
                    : { kind: "hls", url: masterUrl },
            },
        };
    },
};

const registration = { active: { postMessage: (message) => messages.push(message) } };
const navigator = {
    onLine: true,
    serviceWorker: {
        register: async () => registration,
        ready: Promise.resolve(registration),
        controller: { postMessage: (message) => messages.push(message) },
        getRegistration: async () => registration,
        addEventListener: () => {},
    },
    storage: { estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }), persist: async () => true },
};

function loadOfflineModule() {
    let transformed = bundle.babelTransform(
        fs.readFileSync(path.join(root, "frontend/src/lib/offline.js"), "utf8"),
        "offline.js",
        false,
        [],
        [],
    ).code;
    transformed = transformed.replace('await import("hls.js");', "await Promise.resolve();");
    const exports = {};
    const context = {
        exports,
        module: { exports },
        require: (name) => {
            if (name === "@/lib/api") return { api, API: "https://api.example.test/api" };
            if (name === "@/lib/stockage") return {
                ecrireLocal: (key, value) => { storage.set(key, String(value)); return true; },
                lireLocal: (key) => storage.get(key) || null,
                supprimerLocal: (key) => storage.delete(key),
            };
            throw new Error(`Dépendance inattendue : ${name}`);
        },
        window: { isSecureContext: true, setTimeout, clearTimeout, location: { origin: "https://yourmovies.example.test" } },
        navigator,
        performance: { getEntriesByType: () => [{ name: "https://yourmovies.example.test/static/app.js" }] },
        indexedDB,
        IDBKeyRange: { only: (value) => ({ value }) },
        fetch: mockFetch,
        Blob,
        URL,
        Date,
        JSON,
        Promise,
        encodeURIComponent,
        setTimeout,
        clearTimeout,
    };
    vm.runInNewContext(transformed, context, { filename: "offline-transformed.js" });
    return exports;
}

function createCache() {
    const values = new Map();
    const key = (input) => new URL(typeof input === "string" ? input : input.url, "https://yourmovies.example.test").toString();
    return {
        values,
        async put(input, response) { values.set(key(input), response.clone()); },
        async match(input) { return values.get(key(input))?.clone(); },
    };
}

async function loadServiceWorker() {
    const handlers = new Map();
    const cache = createCache();
    const worker = {
        location: { origin: "https://yourmovies.example.test" },
        addEventListener: (event, handler) => handlers.set(event, handler),
        skipWaiting: async () => {},
        clients: { claim: async () => {} },
    };
    const caches = { open: async () => cache, delete: async () => { cache.values.clear(); return true; } };
    vm.runInNewContext(fs.readFileSync(path.join(root, "frontend/public/offline-sw.js"), "utf8"), {
        self: worker,
        indexedDB,
        caches,
        fetch: mockFetch,
        URL,
        Response,
        Headers,
        Date,
        decodeURIComponent,
        Promise,
    }, { filename: "offline-sw.js" });

    async function request(input, options = {}) {
        const headers = new Headers(options.headers || {});
        const value = {
            method: "GET",
            url: new URL(input, worker.location.origin).toString(),
            mode: options.navigate ? "navigate" : "cors",
            destination: options.destination || "",
            headers,
        };
        let pending;
        handlers.get("fetch")({ request: value, respondWith: (promise) => { pending = promise; } });
        assert.ok(pending, `Requête non interceptée : ${input}`);
        return pending;
    }

    return { request, cache, handlers };
}

async function main() {
    const files = [
        "frontend/src/App.js",
        "frontend/src/context/AuthContext.jsx",
        "frontend/src/context/OfflineDownloadsContext.jsx",
        "frontend/src/lib/offline.js",
        "frontend/src/components/OfflineDownloadButton.jsx",
        "frontend/src/components/OfflineDownloadsPanel.jsx",
        "frontend/src/components/EtatConnexion.jsx",
        "frontend/src/pages/OfflineWatchPage.jsx",
        "frontend/src/pages/SettingsPage.jsx",
        "frontend/src/pages/MediaDetailPage.jsx",
        "frontend/src/pages/WatchPage.jsx",
        "frontend/public/offline-sw.js",
    ];
    for (const file of files) bundle.babelParse(fs.readFileSync(path.join(root, file), "utf8"), file, true);

    const offline = loadOfflineModule();
    assert.equal(offline.hasPremiumOfflineAccess(premium), true);
    assert.equal(offline.hasPremiumOfflineAccess({ ...premium, premium_plan: "basic" }), false);
    assert.equal(offline.hasPremiumOfflineAccess({ ...premium, premium_plan: "standard" }), false);
    assert.equal(offline.hasPremiumOfflineAccess({ ...premium, premium_until: new Date(Date.now() - 1000).toISOString() }), false);
    assert.equal(offline.savePremiumOfflineSession(premium), true);
    assert.equal(offline.readPremiumOfflineSession().user_id, premium.user_id);

    const updates = [];
    const episode = { season_number: 1, ep_number: 2, title: "Le départ", duration: 42 };
    const saved = await offline.createOfflineDownload({ media, episode, user: premium, onProgress: (value) => updates.push(value) });
    assert.equal(saved.kind, "hls");
    assert.equal(saved.quality, "720p");
    assert.equal(saved.season_number, 1);
    assert.equal(saved.episode_number, 2);
    assert.equal(updates.at(-1).percent, 100);
    assert.equal(apiCalls[0].options.params.season_number, 1);
    assert.ok(requestedUrls.includes("https://cdn.example.test/video/720/first.ts?token=allowed"));
    assert.ok(messages.some((message) => message.type === "YM_ENABLE_OFFLINE"));

    const metadata = JSON.parse(storage.get("ym_offline_downloads_v1"));
    assert.equal(metadata.length, 1);
    assert.equal(metadata[0].media, undefined, "localStorage conserve uniquement les métadonnées légères");

    const movie = await offline.createOfflineDownload({
        media: { id: "movie-direct", type: "movie", title: "Film local", duration_minutes: 90 },
        user: premium,
    });
    assert.equal(movie.kind, "file");
    assert.equal(movie.size_bytes, 10);
    assert.equal((await offline.listOfflineDownloads(premium.user_id)).length, 2);

    const worker = await loadServiceWorker();
    const playlist = await worker.request(offline.offlinePlaybackUrl(saved));
    assert.equal(playlist.status, 200);
    const manifest = await playlist.text();
    assert.ok(manifest.includes("/_ym-offline/"));
    assert.ok(!manifest.includes("https://cdn.example.test"));

    const segment = await worker.request(`/_ym-offline/${encodeURIComponent(saved.id)}/segment-0`);
    assert.equal(await segment.text(), "segment-one");

    const range = await worker.request(offline.offlinePlaybackUrl(movie), { headers: { Range: "bytes=2-5" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await range.text(), "2345");

    const catalogUrl = "https://api.example.test/api/media?limit=40";
    const initialCatalog = await worker.request(catalogUrl);
    assert.equal(initialCatalog.status, 200);
    await worker.cache.put("/", new Response("<html>application hors connexion</html>"));
    online = false;
    const offlineCatalog = await worker.request(catalogUrl);
    assert.equal(offlineCatalog.status, 200);
    const navigation = await worker.request("/settings?tab=downloads", { navigate: true });
    assert.equal(navigation.status, 200);
    assert.ok((await navigation.text()).includes("hors connexion"));

    const entitlementStore = databases.get("yourmovies-offline-v1").stores.get("settings").values;
    entitlementStore.set("entitlement", { key: "entitlement", user_id: premium.user_id, expires_at: new Date(Date.now() - 1000).toISOString() });
    const expired = await worker.request(offline.offlinePlaybackUrl(movie));
    assert.equal(expired.status, 403);

    entitlementStore.set("entitlement", { key: "entitlement", user_id: "different-user", expires_at: premium.premium_until });
    const wrongAccount = await worker.request(offline.offlinePlaybackUrl(movie));
    assert.equal(wrongAccount.status, 404);

    online = true;
    entitlementStore.set("entitlement", { key: "entitlement", user_id: premium.user_id, expires_at: premium.premium_until });
    await offline.removeOfflineDownload(saved.id, premium.user_id);
    assert.equal((await offline.listOfflineDownloads(premium.user_id)).length, 1);
    const removed = await worker.request(offline.offlinePlaybackUrl(saved));
    assert.equal(removed.status, 404);

    const connectionState = fs.readFileSync(path.join(root, "frontend/src/components/EtatConnexion.jsx"), "utf8");
    assert.ok(connectionState.includes("readPremiumOfflineSession()"));
    assert.ok(connectionState.includes("hors-ligne-premium"));

    process.stdout.write("12 fichiers React/JS analysés sans erreur\n");
    process.stdout.write("Accès Basic/Standard/expiré refusé ; accès Premium autorisé\n");
    process.stdout.write("Téléchargements HLS et MP4, segments signés, métadonnées locales : OK\n");
    process.stdout.write("Pages et catalogue hors connexion, lecture vidéo et requêtes Range : OK\n");
    process.stdout.write("Expiration Premium, cloisonnement des comptes et suppression : OK\n");
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
});
