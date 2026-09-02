import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
    const location = useLocation();
    const navigate = useNavigate();
    const { setUser, refresh } = useAuth();
    const processed = useRef(false);

    useEffect(() => {
        if (processed.current) return;
        processed.current = true;

        const hash = location.hash || window.location.hash;
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const sessionId = params.get("session_id");
        if (!sessionId) {
            navigate("/login", { replace: true });
            return;
        }

        window.history.replaceState(null, "", window.location.pathname);
        (async () => {
            try {
                const r = await api.post("/auth/session", { session_id: sessionId });
                setUser(r.data.user);
                await refresh();
                // clean fragment
                window.history.replaceState(null, "", "/");
                navigate("/", { replace: true });
            } catch (e) {
                navigate("/login", { replace: true });
            }
        })();
    }, [location, navigate, setUser, refresh]);

    return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
            <div className="text-neutral-400">Connexion en cours...</div>
        </div>
    );
}
