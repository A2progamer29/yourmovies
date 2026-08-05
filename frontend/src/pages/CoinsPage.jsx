import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, Flame, MessageSquare, Sparkles, Crown, Check, Gift } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

function PlanCard({ plan, balance, busy, onRedeem }) {
    const options = plan.options || [];
    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const cur = options[idx] || { days: 0, coins: 0 };
    const next = options[(idx + 1) % (options.length || 1)] || cur;

    const flip = () => { if (options.length > 1 && !flipped) setFlipped(true); };
    const onDone = () => { if (flipped) { setIdx((i) => (i + 1) % options.length); setFlipped(false); } };

    const renderFace = (opt) => {
        const affordable = balance >= opt.coins;
        const bkey = `${plan.id}-${opt.days}`;
        return (
            <div className="p-5 rounded-2xl border border-[#E8D2A6]/40 bg-[#0a0a0a] flex flex-col h-full">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#E8D2A6]"><Crown size={16} /> <span className="font-display text-xl">{plan.name}</span></div>
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">{opt.days} j</span>
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                    <Coins size={18} className="text-[#E8D2A6]" />
                    <span className="font-display text-3xl text-white">{opt.coins}</span>
                    {opt.coins_original && opt.coins_original !== opt.coins && (
                        <span className="text-sm text-neutral-500 line-through">{opt.coins_original}</span>
                    )}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                    {opt.days} jours de Premium
                    {opt.coins_original && opt.coins_original !== opt.coins && <span className="text-[#E8D2A6]"> · -50%</span>}
                </div>
                <Button
                    onClick={(e) => { e.stopPropagation(); onRedeem(plan.id, opt); }}
                    disabled={!affordable || busy === bkey}
                    data-testid={`redeem-${bkey}`}
                    className="mt-4 rounded-full font-semibold bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {affordable ? <><Check size={14} className="mr-1.5" /> Échanger</> : `Encore ${Math.max(0, Math.round((opt.coins - balance) * 10) / 10)}`}
                </Button>
            </div>
        );
    };

    return (
        <div style={{ perspective: "1200px" }}>
            <motion.div
                onClick={flip}
                animate={flipped
                    ? { rotateY: 180, y: [0, -60, -60, 14, 0], scale: [1, 1.06, 1.06, 0.97, 1] }
                    : { rotateY: 0, y: 0, scale: 1 }}
                transition={flipped ? {
                    rotateY: { duration: 0.75, ease: "easeInOut" },
                    y: { duration: 0.75, times: [0, 0.25, 0.55, 0.85, 1], ease: ["easeOut", "linear", "easeIn", "easeOut"] },
                    scale: { duration: 0.75, times: [0, 0.25, 0.55, 0.85, 1], ease: ["easeOut", "linear", "easeIn", "easeOut"] },
                } : { duration: 0 }}
                onAnimationComplete={onDone}
                style={{ transformStyle: "preserve-3d" }}
                className="relative cursor-pointer select-none"
            >
                <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>{renderFace(cur)}</div>
                <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>{renderFace(next)}</div>
            </motion.div>
        </div>
    );
}

export default function CoinsPage() {
    const { user, refresh } = useAuth();
    const navigate = useNavigate();
    const [balance, setBalance] = useState(0);
    const [plans, setPlans] = useState([]);
    const [offer, setOffer] = useState(null);
    const [busy, setBusy] = useState("");

    const load = async () => {
        try {
            const r = await api.get("/coins/plans");
            setBalance(r.data.balance);
            setPlans(r.data.plans);
            setOffer(r.data.offer || null);
        } catch (e) { showError(toast, e, "Chargement impossible"); }
    };

    useEffect(() => {
        if (!user) { navigate("/login"); return; }
        load();
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    const redeem = async (planId, option) => {
        if (balance < option.coins) { toast.error("Solde insuffisant"); return; }
        if (!window.confirm(`Échanger ${option.coins} Freemium contre ${option.days} jours de Premium ?`)) return;
        setBusy(`${planId}-${option.days}`);
        try {
            await api.post("/coins/redeem", { plan: planId, days: option.days });
            toast.success("Premium activé 🎉");
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
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2 flex items-center gap-2"><Coins size={14} /> Freemium</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-8">Ta monnaie YourMovie's</h1>

                <div className="grid sm:grid-cols-2 gap-4 mb-12">
                    <div className="p-6 rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-br from-[#171208] to-[#0a0a0a]">
                        <div className="text-xs uppercase tracking-widest text-neutral-400 mb-1">Solde</div>
                        <div className="flex items-center gap-2">
                            <Coins size={28} className="text-[#E8D2A6]" />
                            <span className="font-display text-5xl text-white" data-testid="coins-balance">{balance}</span>
                            <span className="text-neutral-400 mb-1 self-end">Freemium</span>
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
                    <p className="text-neutral-500 text-sm mb-4">Clique une carte pour changer la durée (30 → 60 → 90 jours, de plus en plus chère). Les prix sont volontairement élevés — c'est une récompense de longue haleine.</p>
                    {offer?.active && (
                        <div className="mb-6 p-4 rounded-xl border border-[#E8D2A6]/40 bg-gradient-to-r from-[#171208] to-[#0a0a0a] flex items-center gap-3">
                            <Gift size={20} className="text-[#E8D2A6] shrink-0" />
                            <div className="text-sm">
                                <span className="text-white font-semibold">Offre de bienvenue : -{offer.pct}% en Freemium</span>
                                <span className="text-neutral-400"> — pendant 24 h après ton inscription{offer.ends_at ? `, jusqu'au ${new Date(offer.ends_at).toLocaleString("fr-FR")}` : ""}.</span>
                            </div>
                        </div>
                    )}
                    <div className="grid sm:grid-cols-3 gap-4">
                        {plans.map((plan) => (
                            <PlanCard key={plan.id} plan={plan} balance={balance} busy={busy} onRedeem={redeem} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
