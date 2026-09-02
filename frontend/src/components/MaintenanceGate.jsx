import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import MaintenancePage from "@/pages/MaintenancePage";

const matchesRoute = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

/** Resolve maintenance before mounting auth, the catalogue or background services.
 * This only controls the UI: API authorization remains enforced by the server. */
export default function MaintenanceGate({ children }) {
    const { pathname, search, hash } = useLocation();
    const [online, setOnline] = useState(() => navigator.onLine !== false);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState({ path: null, config: null, error: false });
    const offlineDownloads = !online && (matchesRoute(pathname, "/offline")
        || (pathname === "/settings" && new URLSearchParams(search).get("tab") === "downloads"));
    const allowedRoute = ["/login", "/admin", "/cagnotte", "/don"].some((p) => matchesRoute(pathname, p))
        || hash.includes("session_id=");

    useEffect(() => {
        const update = () => setOnline(navigator.onLine !== false);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    useEffect(() => {
        if (offlineDownloads) return undefined;
        const controller = new AbortController();
        api.get("/maintenance", { silent: true, publicBootstrap: true, signal: controller.signal })
            .then(({ data }) => {
                if (typeof data?.enabled !== "boolean") throw new Error("Invalid maintenance status");
                if (!controller.signal.aborted) setState({ path: pathname, config: data, error: false });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ path: pathname, config: null, error: true });
            });
        return () => controller.abort();
    }, [pathname, attempt, offlineDownloads, online]);

    if (offlineDownloads || allowedRoute || state.config?.enabled === false || state.config?.can_bypass === true) {
        return children;
    }
    if (state.path === pathname && state.config?.enabled) {
        return <MaintenancePage config={state.config} />;
    }
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
            <div className="max-w-md text-center">
                {state.path === pathname && state.error ? <>
                    <h1 className="text-xl">Le site est momentanément indisponible</h1>
                    <p className="mt-3 text-sm text-neutral-400">Impossible de vérifier son état. Réessaie dans un instant.</p>
                    <button type="button" onClick={() => setAttempt((n) => n + 1)}
                        className="mt-6 rounded-full bg-[#E8D2A6] px-5 py-2 text-black">Réessayer</button>
                    <Link to="/login" className="mt-5 block text-sm text-neutral-400 underline">Connexion administrateur</Link>
                </> : <p role="status" className="text-neutral-400">Chargement du site…</p>}
            </div>
        </main>
    );
}
