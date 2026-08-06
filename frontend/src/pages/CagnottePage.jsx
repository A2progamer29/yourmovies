import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PiggyBank, Heart, Info, Gift, Lock, Check, Trophy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";
import DiscordCheckoutDialog from "@/components/DiscordCheckoutDialog";

const PRESETS = [5, 10, 20, 50];

const TIERS = [
    { amount: 100, title: "Plans offerts", desc: "L'organisateur s'engage à offrir 10 plans Standard et 5 plans Basic." },
    { amount: 300, title: "Giveaway Discord", desc: "Un giveaway de 50 € est organisé sur le Discord." },
    { amount: 500, title: "Premium à vie à gagner", desc: "Chance de gagner aléatoirement le plan Premium à vie + 50 € en giveaway." },
    { amount: 700, title: "Gros lot", desc: "100 € en giveaway + 5 plans Premium à vie." },
    { amount: 1000, title: "Récompense finale", desc: "Une récompense de 250 € max à choisir (carte cadeau, etc.)." },
];

export default function CagnottePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState({ total: 0, goal: 1000, reached: false, refund_pct: 0 });
    const [amount, setAmount] = useState("10");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [offer, setOffer] = useState("");

    const load = async () => {
        try {
            const r = await api.get("/cagnotte");
            setData(r.data);
        } catch (e) { showError(toast, e, "Chargement impossible"); }
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

                <div className="p-6 rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-br from-[#171208] to-[#0a0a0a] mb-8">
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
                    <div className="flex items-center gap-2 mb-4">
                        <Trophy size={18} className="text-[#E8D2A6]" />
                        <h2 className="font-display text-2xl">Paliers de récompenses</h2>
                    </div>
                    <div className="space-y-2.5">
                        {TIERS.map((tier) => {
                            const reached = data.total >= tier.amount;
                            return (
                                <div key={tier.amount} className={`flex items-start gap-4 p-4 rounded-lg border ${reached ? "border-[#E8D2A6]/40 bg-gradient-to-br from-[#171208] to-[#0a0a0a]" : "border-[#262626] bg-[#0a0a0a]"}`}>
                                    <div className={`flex flex-col items-center justify-center w-16 shrink-0 ${reached ? "text-[#E8D2A6]" : "text-neutral-600"}`}>
                                        {reached ? <Check size={18} /> : <Lock size={16} />}
                                        <span className="font-display text-lg mt-0.5">{tier.amount}€</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className={`font-medium flex items-center gap-1.5 ${reached ? "text-white" : "text-neutral-300"}`}>
                                            <Gift size={14} className={reached ? "text-[#E8D2A6]" : "text-neutral-600"} /> {tier.title}
                                            {reached && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#E8D2A6] text-black font-bold">Débloqué</span>}
                                        </div>
                                        <div className="text-sm text-neutral-400 mt-1 leading-relaxed">{tier.desc}</div>
                                        {!reached && (
                                            <div className="text-xs text-neutral-600 mt-1.5">Encore {(tier.amount - data.total).toLocaleString("fr-FR")} € pour débloquer</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-neutral-600 mt-3">Récompenses et giveaways gérés manuellement par l'organisateur sur le Discord.</p>
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
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-[180px]">
                            <Input
                                type="number"
                                min="1"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="bg-[#111] border-[#262626] text-white pr-8"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">€</span>
                        </div>
                        <Button onClick={contribute} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-11 px-6">
                            <Heart size={16} className="mr-2" fill="currentColor" /> Contribuer
                        </Button>
                    </div>
                    <p className="text-xs text-neutral-500 mt-3">Paiement via notre Discord — carte bancaire, PayPal, Paysafecard et plus.</p>
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
