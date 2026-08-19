import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PiggyBank, Heart, Info, Gift, Check, Trophy, Lock, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import { PanneauSkeleton } from "@/components/Skeletons";
import DiscordCheckoutDialog from "@/components/DiscordCheckoutDialog";

const PRESETS = [5, 10, 20, 50];

// Produit de soutien : une unité vaut un euro, la quantité fait le montant.
// SellAuth ne propose pas de prix libre — cf. leur documentation Produits.
const SELLAUTH_DON = "https://yourmovies.mysellauth.com/product/soutien-a-lhebergement";

export default function CagnottePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState({ total: 0, goal: 1000, reached: false, refund_pct: 0 });
    const [amount, setAmount] = useState("10");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [chargement, setChargement] = useState(true);
    const [offer, setOffer] = useState("");

    const load = async () => {
        try {
            const r = await api.get("/cagnotte");
            setData(r.data);
        } catch (e) {
            showError(toast, e, "Chargement impossible");
        } finally {
            setChargement(false);
        }
    };

    useEffect(() => { load(); }, []);

    const contribute = () => {
        if (!user) { navigate("/login"); return; }
        const amt = Number(amount);
        if (!amt || amt < 1) { toast.error("Montant minimum : 1 €"); return; }
        setOffer(`Contribution à la cagnotte — ${amt} €`);
        setDialogOpen(true);
    };

    const pct = data.goal > 0 ? Math.min(100, Math.round((data.total / data.goal) * 100)) : 0;

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />

            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2 flex items-center gap-2"><PiggyBank size={14} /> Cagnotte</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-8">Soutiens YourMovie's</h1>

                {chargement && (
                    <div className="mb-8">
                        <PanneauSkeleton colonnes={2} nombre={2} />
                    </div>
                )}

                <div className={`p-6 rounded-2xl border border-[#E8D2A6]/30 bg-[#0c0c0c] mb-8${chargement ? " hidden" : ""}`}>
                    <div className="flex items-baseline justify-between mb-3">
                        <div className="font-display text-4xl text-white">{data.total.toLocaleString("fr-FR")} €</div>
                        <div className="text-neutral-400 text-sm">objectif {data.goal.toLocaleString("fr-FR")} €</div>
                    </div>
                    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-[#E8D2A6] transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-[#E8D2A6] mt-2">{pct}% de l'objectif atteint</div>
                    {data.reached ? (
                        <div className="mt-3 text-sm text-emerald-400">🎉 Objectif atteint — aucun remboursement.</div>
                    ) : (
                        <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-white/10">
                            <span className="text-sm text-neutral-400">Remboursement estimé si clôture maintenant</span>
                            <span className="font-display text-2xl text-[#E8D2A6]" data-testid="refund-pct">{data.refund_pct}%</span>
                        </div>
                    )}
                </div>

                <div className="mb-8">
                    <div className="mb-1 flex items-center gap-2">
                        <Trophy size={18} className="text-[#E8D2A6]" />
                        <h2 className="font-display text-2xl tracking-tight">Plus la cagnotte monte, plus il y a de gagnants</h2>
                    </div>
                    <p className="mb-5 max-w-2xl text-sm leading-relaxed text-neutral-500">
                        Chaque palier atteint déclenche un tirage au sort sur le Discord, ouvert à
                        <span className="text-neutral-300"> tous les membres</span> — y compris ceux qui n&apos;ont rien donné.
                    </p>

                    <div className="space-y-2.5">
                        {(data.tiers || []).map((palier) => {
                            const atteint = data.total >= palier.amount;
                            const manquant = Math.max(0, palier.amount - data.total);
                            const progression = Math.min(100, Math.round((data.total / Math.max(1, palier.amount)) * 100));
                            return (
                                <div
                                    key={palier.amount}
                                    className={`relative overflow-hidden rounded-xl border p-4 ${atteint
                                        ? "ym-shimmer border-[#E8D2A6]/45 bg-[#0f0f0f]"
                                        : palier.highlight
                                            ? "border-[#E8D2A6]/25 bg-[#0c0c0c]"
                                            : "border-[#262626] bg-[#0a0a0a]"}`}
                                >
                                    {!atteint && (
                                        <div
                                            className="absolute inset-y-0 left-0 bg-[#E8D2A6]/[0.06]"
                                            style={{ width: `${progression}%` }}
                                            aria-hidden="true"
                                        />
                                    )}
                                    <div className="relative flex items-start gap-4">
                                        <div className={`flex w-16 shrink-0 flex-col items-center justify-center ${atteint ? "text-[#E8D2A6]" : "text-neutral-600"}`}>
                                            {atteint ? <Check size={18} /> : <Lock size={16} />}
                                            <span className="mt-0.5 font-display text-lg">{palier.amount}€</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`font-medium ${atteint ? "text-white" : "text-neutral-300"}`}>
                                                    {palier.label}
                                                </span>
                                                {atteint && (
                                                    <span className="rounded-full bg-[#E8D2A6] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                                                        Débloqué
                                                    </span>
                                                )}
                                            </div>
                                            <ul className="mt-1.5 space-y-1">
                                                {(palier.rewards || []).map((recompense, i) => (
                                                    <li key={i} className="text-sm leading-relaxed text-neutral-400">
                                                        {recompense}
                                                    </li>
                                                ))}
                                            </ul>
                                            {!atteint && (
                                                <div className="mt-2 text-xs text-neutral-600">
                                                    Encore {manquant.toLocaleString("fr-FR")} € pour débloquer
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="mt-3 text-[11px] leading-relaxed text-neutral-600">
                        Récompenses et tirages au sort gérés à la main sur le Discord, une fois le palier atteint.
                    </p>
                </div>

                <div className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a] mb-8">
                    <h2 className="font-display text-2xl mb-4">Contribuer</h2>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {PRESETS.map((p) => (
                            <button
                                key={p}
                                onClick={() => setAmount(String(p))}
                                className={`px-4 py-2 rounded-full border text-sm transition-colors ${Number(amount) === p ? "border-[#E8D2A6] text-[#E8D2A6] bg-[#E8D2A6]/10" : "border-[#262626] text-neutral-300 hover:border-[#E8D2A6]/50"}`}
                            >
                                {p} €
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative w-full min-w-[130px] sm:w-auto sm:max-w-[180px] sm:flex-1">
                            <Input
                                type="number"
                                min="1"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="bg-[#111] border-[#262626] text-white pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">€</span>
                        </div>
                        <Button asChild className="h-11 flex-1 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B] sm:flex-none sm:px-6">
                            <a href={SELLAUTH_DON} target="_blank" rel="noopener noreferrer">
                                <Heart size={16} className="mr-2" fill="currentColor" /> Contribuer
                            </a>
                        </Button>
                        <Button
                            variant="outline"
                            onClick={contribute}
                            className="h-11 flex-1 rounded-full border-[#262626] bg-transparent px-5 text-white hover:bg-white/5 sm:flex-none sm:px-6"
                        >
                            <MessageCircle size={16} className="mr-2" /> Via Discord
                        </Button>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                        Paiement direct par carte, PayPal, Paysafecard et crypto. Sur la page de
                        paiement, <span className="text-neutral-400">1 unité = 1 €</span> : choisis la
                        quantité correspondant au montant que tu veux donner.
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                        Tu préfères passer par quelqu'un ? Le bouton Discord ouvre un ticket, on s'occupe du reste.
                    </p>
                </div>

                <div className="p-4 rounded-lg border border-[#262626] bg-[#0a0a0a] flex gap-3 text-sm text-neutral-400">
                    <Info size={16} className="text-[#E8D2A6] shrink-0 mt-0.5" />
                    <p>
                        Si l'objectif de {data.goal.toLocaleString("fr-FR")} € n'est pas atteint, <span className="text-[#E8D2A6]">{data.refund_pct}%</span> de chaque contribution est remboursé. Ce taux est calculé automatiquement : plus l'objectif est loin, plus il est élevé (plafonné à 10 %). Les remboursements sont gérés manuellement.
                    </p>
                </div>
            </div>

            <DiscordCheckoutDialog open={dialogOpen} onOpenChange={setDialogOpen} offerLabel={offer} kind="donation" />
        </div>
    );
}
