import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PiggyBank, X } from "lucide-react";
import { api } from "@/lib/api";

const CLE_MASQUE = "ym_support_banner_hidden";

export default function SupportBanner() {
    const navigate = useNavigate();
    const [config, setConfig] = useState(null);
    const [masque, setMasque] = useState(() => {
        try { return window.sessionStorage.getItem(CLE_MASQUE) === "1"; } catch { return false; }
    });

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/support-banner", { silent: true });
                setConfig(r.data);
            } catch {
                setConfig(null);
            }
        })();
    }, []);

    if (!config?.enabled || masque) return null;

    // Masqué pour la session seulement : le message doit revenir à la visite
    // suivante, sans harceler quelqu'un qui navigue de page en page.
    const fermer = () => {
        setMasque(true);
        try { window.sessionStorage.setItem(CLE_MASQUE, "1"); } catch { }
    };

    return (
        <div className="border-b border-[#E8D2A6]/20 bg-[#171208]" data-testid="support-banner">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2.5">
                <PiggyBank size={16} className="shrink-0 text-[#E8D2A6]" />
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-neutral-300 sm:text-sm">
                    {config.message}
                </p>
                <button
                    type="button"
                    onClick={() => navigate("/cagnotte")}
                    data-testid="support-banner-cta"
                    className="shrink-0 rounded-full bg-[#E8D2A6] px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#D4BB8B]"
                >
                    {config.cta_label}
                </button>
                <button
                    type="button"
                    onClick={fermer}
                    aria-label="Masquer ce message"
                    className="shrink-0 text-neutral-600 transition-colors hover:text-white"
                >
                    <X size={15} />
                </button>
            </div>
        </div>
    );
}
