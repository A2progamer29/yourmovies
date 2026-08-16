import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Gift, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export default function ReferralCard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [infos, setInfos] = useState(null);
    const [copie, setCopie] = useState(false);

    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const r = await api.get("/referral/me", { silent: true });
                setInfos(r.data);
            } catch {
                setInfos(null);
            }
        })();
    }, [user]);

    if (!user || !infos || infos.enabled === false) return null;

    const lien = infos.code ? `${window.location.origin}/?ref=${infos.code}` : "";

    const copier = async () => {
        try {
            await navigator.clipboard.writeText(lien);
            setCopie(true);
            toast.success("Lien copié");
            window.setTimeout(() => setCopie(false), 2500);
        } catch {
            toast.error("Copie impossible, sélectionne le lien à la main");
        }
    };

    return (
        <div
            className="ym-shimmer rounded-2xl border border-[#E8D2A6]/30 bg-[#0c0c0c] p-6"
            data-testid="referral-card"
        >
            <div className="flex items-start gap-3">
                <Gift size={20} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                <div className="min-w-0">
                    <div className="font-display text-xl text-white">Invite quelqu&apos;un, gagnez tous les deux</div>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                        Quand une personne crée son compte avec ton lien, tu reçois{" "}
                        <span className="text-[#E8D2A6]">{infos.coins_parrain} Freemium</span> et elle en reçoit{" "}
                        <span className="text-[#E8D2A6]">{infos.coins_filleul}</span>.
                    </p>
                </div>
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-[#262626] bg-[#0a0a0a] px-4 py-3 text-sm text-neutral-200">
                    {lien || "…"}
                </code>
                <Button
                    onClick={copier}
                    disabled={!lien}
                    data-testid="referral-card-copy"
                    className="h-11 shrink-0 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]"
                >
                    {copie ? <Check size={15} className="mr-2" /> : <Copy size={15} className="mr-2" />}
                    {copie ? "Copié" : "Copier"}
                </Button>
            </div>

            <button
                type="button"
                onClick={() => navigate("/parrainage")}
                className="mt-3 text-xs text-neutral-500 transition-colors hover:text-[#E8D2A6]"
            >
                {infos.total > 0
                    ? `${infos.total} filleul${infos.total > 1 ? "s" : ""} · ${infos.coins_gagnes} Freemium gagnés — voir le détail`
                    : "Voir mes parrainages"}
            </button>
        </div>
    );
}
