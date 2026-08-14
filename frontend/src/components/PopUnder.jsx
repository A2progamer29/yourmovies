import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { loadAdsConfig, adsAllowed, frequencyAllows, markShown, injectScript } from "@/lib/ads";

const FREQ_KEY = "ym_popunder_last";
const EXCLUDED = ["/login", "/admin", "/settings", "/profile", "/messages"];

export default function PopUnder() {
    const { user, loading } = useAuth();
    const location = useLocation();

    useEffect(() => {
        // Tant que le compte n'est pas chargé, « user » vaut null : sans cette
        // attente, un membre premium serait traité comme un visiteur anonyme et
        // verrait la publicité au premier clic.
        if (loading || !adsAllowed(user)) return undefined;
        if (EXCLUDED.some((p) => location.pathname.startsWith(p))) return undefined;

        let cancelled = false;
        let cleanup = null;

        (async () => {
            const cfg = await loadAdsConfig();
            if (cancelled) return;
            const pop = cfg?.popunder || {};
            if (!cfg?.enabled || !pop.enabled || !pop.script_url) return;
            if (!frequencyAllows(FREQ_KEY, (pop.frequency_hours || 12) * 60)) return;

            // Les navigateurs exigent une interaction : on attend le premier clic.
            const onFirstClick = () => {
                if (!frequencyAllows(FREQ_KEY, (pop.frequency_hours || 12) * 60)) return;
                markShown(FREQ_KEY);
                injectScript(pop.script_url);
            };
            document.addEventListener("click", onFirstClick, { once: true });
            cleanup = () => document.removeEventListener("click", onFirstClick);
        })();

        return () => {
            cancelled = true;
            if (cleanup) cleanup();
        };
    }, [user, loading, location.pathname]);

    return null;
}
