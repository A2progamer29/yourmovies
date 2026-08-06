import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Sparkles, Star, Crown, Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import DiscordCheckoutDialog from "@/components/DiscordCheckoutDialog";

const PLAN_ICON = {
    basic: <Star size={18} />,
    standard: <Sparkles size={18} />,
    premium: <Crown size={18} />,
};

export default function PricingPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [interval, setInterval] = useState("monthly");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [offerLabel, setOfferLabel] = useState("");
    const [welcome, setWelcome] = useState(null);

    useEffect(() => {
        api.get("/plans").then((r) => setPlans(r.data));
    }, []);

    useEffect(() => {
        if (user) api.get("/premium/offer").then((r) => setWelcome(r.data)).catch(() => { });
        else setWelcome(null);
    }, [user]);

    const discount = (amount) => (welcome?.active ? amount * (1 - welcome.pct / 100) : amount);

    const subscribe = (plan) => {
        if (!user) {
            navigate("/login");
            return;
        }
        const price = plan.prices[interval];
        const per = interval === "yearly" ? "an" : "mois";
        const base = price.amount;
        let label = `${plan.name} — abonnement ${interval === "yearly" ? "annuel" : "mensuel"} (`;
        label += welcome?.active
            ? `${discount(base).toFixed(2)} €/${per} au lieu de ${base.toFixed(2)} € · offre de bienvenue -${welcome.pct}%)`
            : `${base.toFixed(2)} €/${per})`;
        setOfferLabel(label);
        setDialogOpen(true);
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />

            <section className="max-w-6xl mx-auto px-6 py-16">
                <div className="text-center mb-12">
                    <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-3 flex items-center justify-center gap-2">
                        <Sparkles size={14} /> Abonnements
                    </div>
                    <h1 className="font-display text-5xl sm:text-6xl tracking-tighter font-light mb-4">
                        Choisissez votre plan
                    </h1>
                    <p className="text-neutral-400 max-w-xl mx-auto">
                        Regardez films, séries et animes sans publicité. Annulez à tout moment.
                    </p>
                </div>

                {welcome?.active && (
                    <div className="max-w-3xl mx-auto mb-10 p-5 rounded-2xl border border-[#E8D2A6]/50 bg-gradient-to-r from-[#E8D2A6]/15 to-[#0a0a0a] flex items-center gap-4">
                        <Gift size={28} className="text-[#E8D2A6] shrink-0" />
                        <div>
                            <div className="font-display text-xl text-white">Offre de bienvenue : -{welcome.pct}% 🎉</div>
                            <div className="text-sm text-neutral-300">
                                Tous les abonnements Premium sont à <span className="text-[#E8D2A6]">moitié prix</span> pendant 24 h après ton inscription{welcome.ends_at ? ` — jusqu'au ${new Date(welcome.ends_at).toLocaleString("fr-FR")}` : ""}.
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex justify-center mb-10">
                    <div className="inline-flex p-1 border border-[#262626] rounded-full bg-[#0a0a0a]">
                        {["monthly", "yearly"].map((i) => (
                            <button
                                key={i}
                                onClick={() => setInterval(i)}
                                data-testid={`interval-${i}`}
                                className={`px-5 py-2 rounded-full text-sm transition-colors ${interval === i
                                    ? "bg-[#E8D2A6] text-black font-semibold"
                                    : "text-neutral-400 hover:text-white"
                                    }`}
                            >
                                {i === "monthly" ? "Mensuel" : "Annuel"}
                                {i === "yearly" && <span className="ml-2 text-[10px] uppercase text-emerald-400">-20%</span>}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {plans.map((plan) => {
                        const isCurrent = user?.premium && user?.premium_plan === plan.id;
                        const highlight = plan.id === "standard";
                        const price = plan.prices[interval];
                        const priceMonth = discount(interval === "yearly" ? price.amount / 12 : price.amount).toFixed(2);
                        return (
                            <div
                                key={plan.id}
                                data-testid={`plan-${plan.id}`}
                                className={`relative rounded-2xl border p-8 flex flex-col ${highlight
                                    ? "border-[#E8D2A6] bg-gradient-to-b from-[#171208] to-[#0a0a0a]"
                                    : "border-[#262626] bg-[#0a0a0a]"
                                    }`}
                            >
                                {highlight && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-[10px] uppercase tracking-widest bg-[#E8D2A6] text-black rounded-full font-semibold">
                                        Le plus populaire
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-[#E8D2A6] mb-4">
                                    {PLAN_ICON[plan.id]}
                                    <div className="text-xs uppercase tracking-widest">{plan.name}</div>
                                </div>
                                <div className="mb-1 flex items-baseline gap-2 flex-wrap">
                                    <span className="font-display text-5xl">{discount(price.amount).toFixed(2)}€</span>
                                    {welcome?.active && (
                                        <span className="font-display text-2xl text-neutral-600 line-through">{price.amount.toFixed(2)}€</span>
                                    )}
                                    <span className="text-neutral-500 text-sm">/{interval === "monthly" ? "mois" : "an"}</span>
                                </div>
                                {interval === "yearly" && (
                                    <div className="text-xs text-neutral-500">Soit {priceMonth}€/mois</div>
                                )}
                                {welcome?.active && (
                                    <div className="mt-1.5 text-xs text-[#E8D2A6] flex items-center gap-1"><Gift size={11} /> -{welcome.pct}% offre de bienvenue</div>
                                )}
                                <p className="text-neutral-400 text-sm mt-4 mb-6">{plan.tagline}</p>

                                <ul className="space-y-3 mb-8">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2 text-sm text-neutral-300">
                                            <Check size={14} className="text-[#E8D2A6] mt-0.5 shrink-0" />
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    onClick={() => subscribe(plan)}
                                    disabled={isCurrent}
                                    data-testid={`subscribe-${plan.id}`}
                                    className={`mt-auto rounded-full h-11 font-semibold ${highlight
                                        ? "bg-[#E8D2A6] text-black hover:bg-[#D4BB8B]"
                                        : "bg-white text-black hover:bg-neutral-200"
                                        }`}
                                >
                                    {isCurrent ? "Votre abonnement actuel" : `Choisir ${plan.name}`}
                                </Button>
                            </div>
                        );
                    })}
                </div>

                <div className="text-center mt-10 text-xs text-neutral-500">
                    Paiement via notre Discord — carte bancaire, PayPal, Paysafecard et plus. Sans engagement.
                </div>
            </section>

            <DiscordCheckoutDialog open={dialogOpen} onOpenChange={setDialogOpen} offerLabel={offerLabel} kind="subscription" />
        </div>
    );
}
