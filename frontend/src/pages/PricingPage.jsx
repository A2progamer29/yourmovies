import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Sparkles, Star, Crown } from "lucide-react";
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
    const [offer, setOffer] = useState("");

    useEffect(() => {
        api.get("/plans").then((r) => setPlans(r.data));
    }, []);

    const subscribe = (plan) => {
        if (!user) {
            navigate("/login");
            return;
        }
        const price = plan.prices[interval];
        const label = `${plan.name} — abonnement ${interval === "yearly" ? "annuel" : "mensuel"} (${price.amount.toFixed(2)} €/${interval === "yearly" ? "an" : "mois"})`;
        setOffer(label);
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
                        const priceMonth = interval === "yearly" ? (price.amount / 12).toFixed(2) : price.amount.toFixed(2);
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
                                <div className="mb-1">
                                    <span className="font-display text-5xl">{price.amount.toFixed(2)}€</span>
                                    <span className="text-neutral-500 text-sm ml-1">/{interval === "monthly" ? "mois" : "an"}</span>
                                </div>
                                {interval === "yearly" && (
                                    <div className="text-xs text-neutral-500 mb-4">Soit {priceMonth}€/mois</div>
                                )}
                                <p className="text-neutral-400 text-sm mb-6">{plan.tagline}</p>

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

            <DiscordCheckoutDialog open={dialogOpen} onOpenChange={setDialogOpen} offerLabel={offer} kind="subscription" />
        </div>
    );
}
