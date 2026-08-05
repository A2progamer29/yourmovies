import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, Flame, MessageSquare, Sparkles, Crown, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

export default function CoinsPage() {
    const { user, refresh } = useAuth();
    const navigate = useNavigate();
    const [balance, setBalance] = useState(0);
    const [plans, setPlans] = useState([]);
    const [busy, setBusy] = useState("");

    const load = async () => {
        try {
            const r = await api.get("/coins/plans");
            setBalance(r.data.balance);
            setPlans(r.data.plans);
        } catch (e) { showError(toast, e, "Chargement impossible"); }
    };

    useEffect(() => {
        if (!user) { navigate("/login"); return; }
        load();
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    const redeem = async (plan) => {
        if (balance < plan.coins) { toast.error("Solde insuffisant"); return; }
        if (!window.confirm(`Échanger ${plan.coins} YM Coins contre ${plan.days} jours de Premium ${plan.name} ?`)) return;
        setBusy(plan.id);
        try {
            await api.post("/coins/redeem", { plan: plan.id });
            toast.success(`Premium ${plan.name} activé 🎉`);
            await refresh();
            load();
        } catch (e) {
            showError(toast, e, "Échange impossible");
        } finally {
            setBusy("");
        }
    };

    const earnRules = [
        { icon: <Sparkles size={16} />, label: "Première connexion", value: "+10" },
        { icon: <Flame size={16} />, label: "Connexion quotidienne", value: "+3 → +50 selon la série" },
        { icon: <MessageSquare size={16} />, label: "Publier un avis / une réponse", value: "+1 à +3" },
        { icon: <Coins size={16} />, label: "Proposer un titre au Wishboard", value: "+0.5 à +5" },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />

            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2 flex items-center gap-2"><Coins size={14} /> YM Coins</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-8">Ta monnaie YourMovie's</h1>

                <div className="grid sm:grid-cols-2 gap-4 mb-12">
                    <div className="p-6 rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-br from-[#171208] to-[#0a0a0a]">
                        <div className="text-xs uppercase tracking-widest text-neutral-400 mb-1">Solde</div>
                        <div className="flex items-center gap-2">
                            <Coins size={28} className="text-[#E8D2A6]" />
                            <span className="font-display text-5xl text-white" data-testid="coins-balance">{balance}</span>
                            <span className="text-neutral-400 mb-1 self-end">YM Coins</span>
                        </div>
                    </div>
                    <div className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a] flex items-center gap-4">
                        <Flame size={32} className={user?.login_streak > 0 ? "text-[#E8D2A6]" : "text-neutral-600"} />
                        <div>
                            <div className="font-display text-3xl">{user?.login_streak || 0} jour(s)</div>
                            <div className="text-sm text-neutral-400">Série de connexion — reviens chaque jour pour ne pas la perdre.</div>
                        </div>
                    </div>
                </div>

                <div className="mb-12">
                    <h2 className="font-display text-2xl mb-4">Comment en gagner</h2>
                    <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] divide-y divide-[#1a1a1a]">
                        {earnRules.map((r, i) => (
                            <div key={i} className="flex items-center justify-between px-5 py-3.5">
                                <div className="flex items-center gap-3 text-neutral-200"><span className="text-[#E8D2A6]">{r.icon}</span> {r.label}</div>
                                <div className="text-[#E8D2A6] font-medium text-sm">{r.value}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <h2 className="font-display text-2xl mb-1">Échanger contre du Premium</h2>
                    <p className="text-neutral-500 text-sm mb-6">Débloque un plan avec tes YM Coins. Les prix sont volontairement élevés — c'est une récompense de longue haleine.</p>
                    <div className="grid sm:grid-cols-3 gap-4">
                        {plans.map((plan) => {
                            const affordable = balance >= plan.coins;
                            return (
                                <div key={plan.id} className={`p-5 rounded-2xl border bg-[#0a0a0a] flex flex-col ${affordable ? "border-[#E8D2A6]/40" : "border-[#262626]"}`}>
                                    <div className="flex items-center gap-2 text-[#E8D2A6]"><Crown size={16} /> <span className="font-display text-xl">{plan.name}</span></div>
                                    <div className="mt-4 flex items-baseline gap-1.5">
                                        <Coins size={18} className="text-[#E8D2A6]" />
                                        <span className="font-display text-3xl text-white">{plan.coins}</span>
                                    </div>
                                    <div className="text-xs text-neutral-500 mt-1">{plan.days} jours de Premium</div>
                                    <Button
                                        onClick={() => redeem(plan)}
                                        disabled={!affordable || busy === plan.id}
                                        data-testid={`redeem-${plan.id}`}
                                        className="mt-5 rounded-full font-semibold bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {affordable ? <><Check size={14} className="mr-1.5" /> Échanger</> : `Encore ${Math.max(0, Math.round((plan.coins - balance) * 10) / 10)}`}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
