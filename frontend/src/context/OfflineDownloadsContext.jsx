import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    clearOfflineDownloads,
    createOfflineDownload,
    enablePremiumOffline,
    getOfflineStorageEstimate,
    hasPremiumOfflineAccess,
    listOfflineDownloads,
    makeDownloadId,
    readLocalDownloadIndex,
    removeOfflineDownload,
    savePremiumOfflineSession,
} from "@/lib/offline";

const OfflineDownloadsContext = createContext(null);

export function OfflineDownloadsProvider({ children }) {
    const { user, loading, activeProfile } = useAuth();
    const eligible = hasPremiumOfflineAccess(user);
    const [downloads, setDownloads] = useState(() => readLocalDownloadIndex(user?.user_id));
    const [progress, setProgress] = useState({});
    const [storage, setStorage] = useState({ usage: 0, quota: 0 });
    const [ready, setReady] = useState(false);

    const refresh = useCallback(async () => {
        if (!eligible || !user?.user_id) {
            setDownloads([]);
            return [];
        }
        const [items, estimate] = await Promise.all([
            listOfflineDownloads(user.user_id),
            getOfflineStorageEstimate().catch(() => ({ usage: 0, quota: 0 })),
        ]);
        setDownloads(items);
        setStorage(estimate);
        return items;
    }, [eligible, user?.user_id]);

    useEffect(() => {
        if (loading) return undefined;
        let mounted = true;
        if (!eligible) {
            clearOfflineDownloads().catch(() => {});
            setDownloads([]);
            setReady(false);
            return () => { mounted = false; };
        }

        savePremiumOfflineSession(user);
        // La session est résolue après le premier rendu : restaurer l’index ici
        // évite qu’un démarrage sans réseau masque les vidéos déjà enregistrées.
        setDownloads(readLocalDownloadIndex(user.user_id));
        enablePremiumOffline(user)
            .then(() => refresh())
            .then(() => { if (mounted) setReady(true); })
            .catch(() => { if (mounted) setReady(false); });
        return () => { mounted = false; };
    }, [eligible, loading, refresh, user]);

    const download = useCallback(async (media, episode = null) => {
        const id = makeDownloadId(media.id, episode, user?.user_id);
        setProgress((current) => ({ ...current, [id]: { percent: 0, bytes: 0 } }));
        try {
            const result = await createOfflineDownload({
                media,
                episode,
                user,
                activeProfile,
                onProgress: (value) => setProgress((current) => ({ ...current, [id]: value })),
            });
            await refresh();
            return result;
        } finally {
            setProgress((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
        }
    }, [activeProfile, refresh, user]);

    const remove = useCallback(async (downloadId) => {
        await removeOfflineDownload(downloadId, user?.user_id);
        await refresh();
    }, [refresh, user?.user_id]);

    const getDownload = useCallback((mediaId, episode = null) => {
        const id = makeDownloadId(mediaId, episode, user?.user_id);
        return downloads.find((item) => item.id === id) || null;
    }, [downloads, user?.user_id]);

    const value = useMemo(() => ({
        eligible,
        ready,
        downloads,
        progress,
        storage,
        download,
        remove,
        refresh,
        getDownload,
    }), [eligible, ready, downloads, progress, storage, download, remove, refresh, getDownload]);

    return <OfflineDownloadsContext.Provider value={value}>{children}</OfflineDownloadsContext.Provider>;
}

export function useOfflineDownloads() {
    const context = useContext(OfflineDownloadsContext);
    if (!context) throw new Error("useOfflineDownloads doit être utilisé dans OfflineDownloadsProvider.");
    return context;
}
