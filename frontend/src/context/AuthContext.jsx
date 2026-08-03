import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

// Convert hex color like #E8D2A6 into a slightly darker hover variant.
function darken(hex, amount = 0.12) {
    if (!hex || !hex.startsWith("#") || hex.length !== 7) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 - amount)))).toString(16).padStart(2, "0");
    return `#${f(r)}${f(g)}${f(b)}`;
}

function applyAccent(color) {
    const root = document.documentElement;
    if (color) {
        root.style.setProperty("--accent", color);
        root.style.setProperty("--accent-hover", darken(color, 0.12));
    } else {
        root.style.removeProperty("--accent");
        root.style.removeProperty("--accent-hover");
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = useCallback(async () => {
        try {
            const res = await api.get("/auth/me", { silent: true });
            setUser(res.data);
        } catch (e) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (window.location.hash?.includes("session_id=")) {
            setLoading(false);
            return;
        }
        checkAuth();
    }, [checkAuth]);

    // Apply accent color when user data changes
    useEffect(() => {
        if (user?.premium && user?.accent_color) {
            applyAccent(user.accent_color);
        } else {
            applyAccent(null);
        }
    }, [user]);

    const login = async (email, password) => {
        const res = await api.post("/auth/login", { email, password });
        localStorage.setItem("ym_token", res.data.token);
        setUser(res.data.user);
        return res.data.user;
    };

    const register = async (email, password, name) => {
        const res = await api.post("/auth/register", { email, password, name });
        localStorage.setItem("ym_token", res.data.token);
        setUser(res.data.user);
        return res.data.user;
    };

    const loginWithGoogle = async (credential) => {
        const res = await api.post("/auth/google", { credential });
        localStorage.setItem("ym_token", res.data.token);
        setUser(res.data.user);
        return res.data.user;
    };

    const logout = async () => {
        try {
            await api.post("/auth/logout");
        } catch (e) {
            // ignore logout errors
        }
        localStorage.removeItem("ym_token");
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, setUser, loading, login, register, loginWithGoogle, logout, refresh: checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
