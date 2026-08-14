import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { loadAdsConfig, adsAllowed, injectScript } from "@/lib/ads";

export default function AdBanner({ className = "" }) {
    const { user, loading } = useAuth();
    const slotRef = useRef(null);
    const [banner, setBanner] = useState(null);

    useEffect(() => {
        let cancelled = false;
        // Même attente que le popunder : on ne montre rien avant de savoir si
        // la personne est premium.
        if (loading || !adsAllowed(user)) { setBanner(null); return undefined; }
        (async () => {
            const cfg = await loadAdsConfig();
            if (cancelled) return;
            const ban = cfg?.banner || {};
            if (!cfg?.enabled || !ban.enabled || !ban.script_url) return;
            setBanner(ban);
        })();
        return () => { cancelled = true; };
    }, [user, loading]);

    // L'emplacement n'apparaît dans la page qu'au rendu suivant. Injecter dans
    // le même souffle viserait un conteneur encore absent — c'est exactement ce
    // qui empêchait la bannière de s'afficher.
    useEffect(() => {
        if (!banner || !slotRef.current) return;
        // Les bannières classiques attendent un réglage global posé avant le
        // script : la clé se lit dans l'adresse, les dimensions viennent du panel.
        const cle = (String(banner.script_url).match(/\/([a-f0-9]{16,})\/invoke\.js/i) || [])[1];
        if (cle) {
            window.atOptions = {
                key: cle,
                format: "iframe",
                height: Number(banner.height) || 90,
                width: Number(banner.width) || 728,
                params: {},
            };
        }
        injectScript(banner.script_url, slotRef.current);
    }, [banner]);

    if (!banner) return null;

    return (
        <section className={`max-w-7xl mx-auto px-6 mt-12 ${className}`} aria-label="Publicité">
            <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-600 mb-2">Publicité</div>
            <div
                ref={slotRef}
                data-testid="promo-slot"
                className="min-h-[90px] w-full overflow-hidden rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]"
            />
        </section>
    );
}
