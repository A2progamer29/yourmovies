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
import ReferralCard from "@/components/ReferralCard";

function DiscordIcon({ size = 18 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.08.08 0 0 0-.079.037c-.21.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.25.08.08 0 0 0-.078-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.319 13.58.1 18.058a.08.08 0 0 0 .031.056c2.053 1.508 4.041 2.423 5.993 3.03a.08.08 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.08.08 0 0 0-.042-.106 12.3 12.3 0 0 1-1.872-.892.08.08 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.07.07 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.061 0a.07.07 0 0 1 .079.009c.12.1.246.198.373.292a.08.08 0 0 1-.007.128c-.598.343-1.22.645-1.873.891a.08.08 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.08.08 0 0 0 .084.029c1.961-.607 3.95-1.522 6.002-3.03a.08.08 0 0 0 .031-.055c.5-5.177-.838-9.674-3.548-13.66a.06.06 0 0 0-.031-.029ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419s.956-2.419 2.157-2.419c1.21 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419Z" />
        </svg>
    );
}

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
        if (!user) return;
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
        { icon: <Gift size={16} />, label: "Parrainer un nouveau membre", value: "+50" },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />

            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2 flex items-center gap-2"><Coins size={14} /> Freemium</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-8">Ta monnaie YourMovie's</h1>

                {offer?.active && (
                    <div className="mb-8 p-5 rounded-2xl border border-[#E8D2A6]/50 bg-gradient-to-r from-[#E8D2A6]/15 to-[#0a0a0a] flex items-center gap-4">
                        <Gift size={28} className="text-[#E8D2A6] shrink-0" />
                        <div>
                            <div className="font-display text-xl text-white">Offre de bienvenue : -{offer.pct}% 🎉</div>
                            <div className="text-sm text-neutral-300">Tous les plans Premium sont à <span className="text-[#E8D2A6]">moitié prix en Freemium</span> pendant 24 h après ton inscription{offer.ends_at ? ` — jusqu'au ${new Date(offer.ends_at).toLocaleString("fr-FR")}` : ""}.</div>
                        </div>
                    </div>
                )}

                {!user && (
                    <div className="mb-12 p-6 rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-r from-[#171208] to-[#0a0a0a] flex items-center justify-between gap-5 flex-wrap">
                        <div>
                            <div className="font-display text-xl text-white">Gagne des Freemium gratuitement</div>
                            <div className="text-sm text-neutral-400 mt-1">Connecte-toi pour cumuler des Freemium et les échanger contre du Premium.</div>
                        </div>
                        <Button onClick={() => navigate("/login")} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold h-11 px-6 shrink-0">
                            Se connecter
                        </Button>
                    </div>
                )}

                {user && (
                <div className="grid sm:grid-cols-2 gap-4 mb-12">
                    <div className="p-6 rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-br from-[#171208] to-[#0a0a0a]">
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
                            <div className="text-sm text-neutral-400">Série de connexion</div>
                        </div>
                    </div>
                </div>
                )}

                <div className="mb-12">
                    <ReferralCard />
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
                    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-[#262626] bg-[#0a0a0a] px-6 py-7 text-center">
                        <div className="font-display text-xl text-white">Vous voulez en gagner plus ?</div>
                        <p className="max-w-md text-sm text-neutral-400">
                            Événements, giveaways et bonus Freemium sont annoncés sur le Discord.
                        </p>
                        <a
                            href="https://discord.gg/6mGTfvcNeD"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="earn-more-discord"
                            className="mt-1 inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-[#5865F2] px-7 text-sm font-semibold text-white shadow-lg shadow-[#5865F2]/20 transition-colors hover:bg-[#4752C4]"
                        >
                            <DiscordIcon size={18} /> Rejoindre le Discord
                        </a>
                    </div>
                </div>

                {user && (
                <div>
                    <h2 className="font-display text-2xl mb-4">Échanger contre du Premium</h2>
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
                )}
            </div>
        </div>
    );
}
