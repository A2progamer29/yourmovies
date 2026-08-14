import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { loadAdsConfig, adsAllowed, injectScript } from "@/lib/ads";

export default function AdBanner({ className = "" }) {
    const { user } = useAuth();
    const slotRef = useRef(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!adsAllowed(user)) { setActive(false); return undefined; }
        (async () => {
            const cfg = await loadAdsConfig();
            if (cancelled) return;
            const banner = cfg?.banner || {};
            if (!cfg?.enabled || !banner.enabled || !banner.script_url) return;
            setActive(true);
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
            if (slotRef.current) injectScript(banner.script_url, slotRef.current);
        })();
        return () => { cancelled = true; };
    }, [user]);

    if (!active) return null;

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
