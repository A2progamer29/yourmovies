import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PiggyBank, X } from "lucide-react";
import { api } from "@/lib/api";

const CLE_MASQUE = "ym_support_banner_hidden";

export default function SupportBanner() {
    const navigate = useNavigate();
    const [config, setConfig] = useState(null);
    const [masque, setMasque] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/support-banner", { silent: true });
                setConfig(r.data);
                // En mode « à chaque rechargement », la fermeture ne dure que le
                // temps de la page : on ne relit donc aucune préférence stockée.
                if (!r.data?.always_show) {
                    try { setMasque(window.sessionStorage.getItem(CLE_MASQUE) === "1"); } catch { }
                }
            } catch {
                setConfig(null);
            }
        })();
    }, []);

    if (!config?.enabled || masque) return null;

    const fermer = () => {
        setMasque(true);
        // Sans l'option, le bandeau reste masqué jusqu'à la prochaine visite ;
        // avec, il revient dès le rechargement suivant.
        if (!config.always_show) {
            try { window.sessionStorage.setItem(CLE_MASQUE, "1"); } catch { }
        }
    };

    return (
        <div className="border-b border-[#E8D2A6]/20 bg-[#0c0c0c]" data-testid="support-banner">
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
