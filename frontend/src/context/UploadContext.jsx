import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const UploadContext = createContext(null);
const STORAGE_KEY = "yourmovies_admin_uploads_v2";

function restoreUploads() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        return saved
            .filter((item) => item?.id && (item.updatedAt || 0) >= cutoff)
            .map((item) => item.status === "uploading" || item.status === "cancelling"
                ? {
                    ...item,
                    status: item.videoId ? "checking" : "interrupted",
                    stage: item.videoId
                        ? "Vérification du téléversement Bunny…"
                        : "Interrompu par l’actualisation — sélectionne à nouveau le fichier",
                    updatedAt: Date.now(),
                }
                : item);
    } catch {
        return [];
    }
}

export function UploadProvider({ children }) {
    const { user } = useAuth();
    const isAdmin = Boolean(user?.is_admin);
    const [uploads, setUploads] = useState(restoreUploads);
    const [uploadsMinimized, setUploadsMinimized] = useState(false);
    const cleanupTimers = useRef(new Map());
    const cancelHandlers = useRef(new Map());
    const uploadsRef = useRef(uploads);

    useEffect(() => {
        uploadsRef.current = uploads;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(uploads));
        } catch {
            // Le suivi visuel ne doit jamais bloquer un téléversement.
        }
    }, [uploads]);

    useEffect(() => {
        const warnBeforeRefresh = (event) => {
            if (!uploads.some((item) => item.status === "uploading" || item.status === "cancelling")) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnBeforeRefresh);
        return () => window.removeEventListener("beforeunload", warnBeforeRefresh);
    }, [uploads]);

    useEffect(() => () => {
        cleanupTimers.current.forEach((timer) => window.clearTimeout(timer));
        cleanupTimers.current.clear();
        cancelHandlers.current.clear();
    }, []);

    const beginUpload = useCallback((file, key, stage = "Préparation", metadata = {}) => {
        const id = `${key}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setUploads((current) => [
            ...current,
            {
                id,
                key,
                name: file?.name || "Fichier",
                progress: 0,
                stage,
                status: "uploading",
                updatedAt: Date.now(),
                ...metadata,
            },
        ]);
        setUploadsMinimized(false);
        return id;
    }, []);

    const updateUpload = useCallback((id, patch) => {
        setUploads((current) => current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item));
    }, []);

    const setUploadCancelHandler = useCallback((id, handler) => {
        if (typeof handler === "function") cancelHandlers.current.set(id, handler);
        else cancelHandlers.current.delete(id);
    }, []);

    const removeUpload = useCallback((id) => {
        const timer = cleanupTimers.current.get(id);
        if (timer) window.clearTimeout(timer);
        cleanupTimers.current.delete(id);
        cancelHandlers.current.delete(id);
        setUploads((current) => current.filter((item) => item.id !== id));
    }, []);

    const cancelUpload = useCallback(async (id) => {
        const item = uploadsRef.current.find((candidate) => candidate.id === id);
        if (!item || item.status === "cancelling") return;
        updateUpload(id, { status: "cancelling", stage: "Annulation et suppression sur Bunny…" });
        try {
            const localHandler = cancelHandlers.current.get(id);
            if (localHandler) {
                await localHandler();
            } else if (item.videoId) {
                await api.delete(`/bunny/videos/${item.videoId}`, {
                    params: item.libraryId ? { library_id: item.libraryId } : undefined,
                });
            }
            cancelHandlers.current.delete(id);
            updateUpload(id, { status: "cancelled", stage: "Annulé et supprimé de Bunny Stream", progress: 0 });
        } catch (error) {
            updateUpload(id, {
                status: "error",
                stage: error?.response?.data?.detail || "Annulation impossible — réessaie",
            });
        }
    }, [updateUpload]);

    const completeUpload = useCallback((id) => {
        cancelHandlers.current.delete(id);
        updateUpload(id, { progress: 100, stage: "Terminé", status: "success" });
        const previous = cleanupTimers.current.get(id);
        if (previous) window.clearTimeout(previous);
        const timer = window.setTimeout(() => {
            setUploads((current) => current.filter((item) => item.id !== id));
            cleanupTimers.current.delete(id);
        }, 8000);
        cleanupTimers.current.set(id, timer);
    }, [updateUpload]);

    const failUpload = useCallback((id, stage = "Échec du téléversement") => {
        cancelHandlers.current.delete(id);
        setUploads((current) => current.map((item) => {
            if (item.id !== id || item.status === "cancelled" || item.status === "cancelling") return item;
            return { ...item, stage, status: "error", updatedAt: Date.now() };
        }));
    }, []);

    useEffect(() => {
        let stopped = false;
        let timer = null;
        let cursor = 0;
        let requestInFlight = false;

        const scheduleNextCheck = (delay = 30000) => {
            if (stopped) return;
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(verifyUploads, delay);
        };

        const verifyUploads = async () => {
            if (stopped || requestInFlight) return;
            // Le suivi d'encodage Bunny est réservé aux admins : sans ce contrôle,
            // les téléversements restaurés déclencheraient des 401 en boucle.
            if (!isAdmin) return;
            requestInFlight = true;

            const seen = new Set();
            const candidates = uploadsRef.current.filter((item) => {
                if (!item.videoId || !["uploading", "checking", "interrupted"].includes(item.status)) return false;
                const reference = `${item.libraryId || "default"}:${item.videoId}`;
                if (seen.has(reference)) return false;
                seen.add(reference);
                return true;
            });

            if (!candidates.length) {
                requestInFlight = false;
                scheduleNextCheck(60000);
                return;
            }

            const item = candidates[cursor % candidates.length];
            cursor = (cursor + 1) % candidates.length;

            try {
                const response = await api.get(`/bunny/video-status/${item.videoId}`, {
                    params: item.libraryId ? { library_id: item.libraryId } : undefined,
                });
                if (stopped) return;
                const complete = response.data.status >= 4;
                setUploads((current) => current.map((entry) =>
                    entry.videoId === item.videoId && (entry.libraryId || null) === (item.libraryId || null)
                        ? {
                            ...entry,
                            status: complete ? "success" : "checking",
                            stage: complete ? "Encodage terminé" : "Encodage en cours",
                            progress: complete ? 100 : (response.data.encodeProgress || entry.progress),
                            updatedAt: Date.now(),
                        }
                        : entry));
                scheduleNextCheck(complete ? 1000 : 5000);
            } catch (error) {
                if (stopped) return;
                const status = error?.response?.status;
                if (status === 400 || status === 404) {
                    cancelHandlers.current.delete(item.id);
                    setUploads((current) => current.map((entry) => entry.id === item.id ? {
                        ...entry,
                        status: status === 404 ? "cancelled" : "error",
                        stage: status === 404
                            ? "Vidéo supprimée — téléversement annulé"
                            : "Référence vidéo invalide — tu peux relancer ce téléversement",
                        progress: 0,
                        updatedAt: Date.now(),
                    } : entry));
                    scheduleNextCheck(1000);
                } else if (status === 429) {
                    const retryAfter = Number(error?.response?.headers?.["retry-after"]) || 60;
                    scheduleNextCheck(Math.max(retryAfter * 1000, 60000));
                } else {
                    scheduleNextCheck(30000);
                }
            } finally {
                requestInFlight = false;
            }
        };

        verifyUploads();
        return () => {
            stopped = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [isAdmin]);

    const activeUpload = useCallback(
        (key) => uploads.find((item) => item.key === key && ["uploading", "checking", "cancelling"].includes(item.status)),
        [uploads],
    );

    const value = {
        uploads,
        uploadsMinimized,
        setUploadsMinimized,
        beginUpload,
        updateUpload,
        completeUpload,
        failUpload,
        removeUpload,
        cancelUpload,
        setUploadCancelHandler,
        activeUpload,
    };

    return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
    const context = useContext(UploadContext);
    if (!context) throw new Error("useUploads doit être utilisé dans UploadProvider");
    return context;
}
