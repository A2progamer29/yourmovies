import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const UploadContext = createContext(null);

export function UploadProvider({ children }) {
    const [uploads, setUploads] = useState([]);
    const [uploadsMinimized, setUploadsMinimized] = useState(false);
    const cleanupTimers = useRef(new Map());

    useEffect(() => () => {
        cleanupTimers.current.forEach((timer) => window.clearTimeout(timer));
        cleanupTimers.current.clear();
    }, []);

    const beginUpload = useCallback((file, key, stage = "Préparation") => {
        const id = `${key}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setUploads((current) => [
            ...current,
            { id, key, name: file?.name || "Fichier", progress: 0, stage, status: "uploading" },
        ]);
        setUploadsMinimized(false);
        return id;
    }, []);

    const updateUpload = useCallback((id, patch) => {
        setUploads((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    }, []);

    const removeUpload = useCallback((id) => {
        const timer = cleanupTimers.current.get(id);
        if (timer) window.clearTimeout(timer);
        cleanupTimers.current.delete(id);
        setUploads((current) => current.filter((item) => item.id !== id));
    }, []);

    const completeUpload = useCallback((id) => {
        updateUpload(id, { progress: 100, stage: "Terminé", status: "success" });
        const previous = cleanupTimers.current.get(id);
        if (previous) window.clearTimeout(previous);
        const timer = window.setTimeout(() => {
            setUploads((current) => current.filter((item) => item.id !== id));
            cleanupTimers.current.delete(id);
        }, 8000);
        cleanupTimers.current.set(id, timer);
    }, [updateUpload]);

    const failUpload = useCallback((id) => {
        updateUpload(id, { stage: "Échec du téléversement", status: "error" });
    }, [updateUpload]);

    const activeUpload = useCallback(
        (key) => uploads.find((item) => item.key === key && item.status === "uploading"),
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
        activeUpload,
    };

    return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploads() {
    const context = useContext(UploadContext);
    if (!context) throw new Error("useUploads doit être utilisé dans UploadProvider");
    return context;
}
