import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
    const { user, activeProfile } = useAuth();
    const [favIds, setFavIds] = useState(() => new Set());
    const [watchIds, setWatchIds] = useState(() => new Set());

    const load = useCallback(async () => {
        if (!user) { setFavIds(new Set()); setWatchIds(new Set()); return; }
        try {
            const r = await api.get("/favorites", { silent: true });
            const f = new Set(), w = new Set();
            (r.data || []).forEach((m) => {
                if (m.list_type === "watchlist") w.add(m.id);
                else f.add(m.id);
            });
            setFavIds(f);
            setWatchIds(w);
        } catch { /* ignore */ }
    }, [user]);

    // recharge quand l'utilisateur ou le profil actif change (favoris scopés par profil)
    useEffect(() => { load(); }, [load, activeProfile]);

    const setStatus = (mediaId, listType, active) => {
        const setter = listType === "watchlist" ? setWatchIds : setFavIds;
        setter((prev) => {
            const next = new Set(prev);
            if (active) next.add(mediaId); else next.delete(mediaId);
            return next;
        });
    };

    return (
        <FavoritesContext.Provider value={{ favIds, watchIds, setStatus, reloadFavorites: load }}>
            {children}
        </FavoritesContext.Provider>
    );
}

export const useFavorites = () =>
    useContext(FavoritesContext) || { favIds: new Set(), watchIds: new Set(), setStatus: () => {}, reloadFavorites: () => {} };
