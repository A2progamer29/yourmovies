import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Gift, Copy, Users, Coins, Check } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { PanneauSkeleton } from "@/components/Skeletons";

export default function ReferralPage() {
    const { user, loading } = useAuth();
    const [infos, setInfos] = useState(null);
    const [copie, setCopie] = useState(false);

    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const r = await api.get("/referral/me");
                setInfos(r.data);
            } catch (e) { showError(toast, e, "Chargement du parrainage impossible"); }
        })();
    }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    const lien = infos?.code ? `${window.location.origin}/?ref=${infos.code}` : "";

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
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="mx-auto max-w-3xl px-6 py-12">
                <div className="mb-10">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-[#E8D2A6]">
                        <Gift size={13} /> Parrainage
                    </div>
                    <h1 className="font-display text-4xl tracking-tighter sm:text-5xl">Invite, et gagnez tous les deux</h1>
                    {infos && (
                        <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
                            Partage ton lien. Quand quelqu&apos;un crée son compte avec, tu reçois{" "}
                            <span className="text-[#E8D2A6]">{infos.coins_parrain} Freemium</span> et il en reçoit{" "}
                            <span className="text-[#E8D2A6]">{infos.coins_filleul}</span> pour bien démarrer.
                        </p>
                    )}
                </div>

                {!infos ? (
                    <PanneauSkeleton colonnes={2} nombre={2} />
                ) : infos.enabled === false ? (
                    <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-8 text-center text-sm text-neutral-400">
                        Le parrainage est momentanément désactivé.
                    </div>
                ) : (
                    <>
                        <div className="ym-shimmer rounded-2xl border border-[#E8D2A6]/25 bg-[#E8D2A6]/[0.04] p-5 sm:p-6">
                            <div className="text-[10px] uppercase tracking-widest text-neutral-400">Ton lien</div>
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <code
                                    data-testid="referral-link"
                                    className="min-w-0 flex-1 truncate rounded-lg border border-[#262626] bg-[#0a0a0a] px-4 py-3 text-sm text-neutral-200"
                                >
                                    {lien || "…"}
                                </code>
                                <Button
                                    onClick={copier}
                                    disabled={!lien}
                                    data-testid="copy-referral"
                                    className="shrink-0 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]"
                                >
                                    {copie ? <Check size={15} className="mr-2" /> : <Copy size={15} className="mr-2" />}
                                    {copie ? "Copié" : "Copier"}
                                </Button>
                            </div>
                            <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                                Le lien reste valable indéfiniment. La personne peut visiter le site, revenir plus tard
                                et créer son compte : le parrainage sera quand même pris en compte.
                            </p>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
                                    <Users size={12} /> Filleuls
                                </div>
                                <div className="mt-1.5 font-display text-3xl">{infos?.total ?? 0}</div>
                            </div>
                            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
                                    <Coins size={12} /> Freemium gagnés
                                </div>
                                <div className="mt-1.5 font-display text-3xl text-[#E8D2A6]">{infos?.coins_gagnes ?? 0}</div>
                            </div>
                        </div>

                        {(infos?.filleuls || []).length > 0 && (
                            <div className="mt-6">
                                <div className="mb-3 text-[10px] uppercase tracking-widest text-neutral-500">Ils t&apos;ont rejoint</div>
                                <div className="space-y-1.5">
                                    {infos.filleuls.map((f, i) => (
                                        <div key={i} className="flex items-center gap-3 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] px-4 py-2.5 text-sm">
                                            <span className="min-w-0 flex-1 truncate text-neutral-200">{f.filleul_name || "Membre"}</span>
                                            <span className="shrink-0 text-xs text-[#E8D2A6]">+{f.coins_parrain}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
