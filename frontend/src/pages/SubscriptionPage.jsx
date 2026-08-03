import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { Crown, Calendar, CreditCard, XCircle, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { describeError, showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

export default function SubscriptionPage() {
    const { user, loading, refresh } = useAuth();
    const [sub, setSub] = useState(null);
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (user) api.get("/subscription/current").then((r) => setSub(r.data));
    }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    const cancel = async () => {
        if (!window.confirm("Confirmez-vous l'annulation à la fin de la période en cours ?")) return;
        setBusy(true);
        try {
            await api.post("/subscription/cancel");
            const r = await api.get("/subscription/current");
            setSub(r.data);
            toast.success("Abonnement annulé à la fin de la période");
        } catch (e) {
            showError(toast, e, "Annulation impossible");
        } finally {
            setBusy(false);
        }
    };

    const resume = async () => {
        setBusy(true);
        try {
            await api.post("/subscription/resume");
            const r = await api.get("/subscription/current");
            setSub(r.data);
            toast.success("Abonnement réactivé");
        } catch (e) {
            showError(toast, e, "Réactivation impossible");
        } finally {
            setBusy(false);
        }
    };

    const formatDate = (iso) => {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        } catch { return iso; }
    };
    const formatMoney = (cents, currency) => {
        if (cents == null) return "—";
        return `${(cents / 100).toFixed(2)} ${(currency || "eur").toUpperCase()}`;
    };

    if (!user.premium) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-2xl mx-auto px-6 py-20 text-center">
                    <Crown size={40} className="mx-auto text-[#E8D2A6] mb-6" />
                    <h1 className="font-display text-4xl mb-3">Aucun abonnement actif</h1>
                    <p className="text-neutral-400 mb-8">Rejoignez YourMovie&apos;s Premium pour du contenu sans publicité, en 4K.</p>
                    <Button onClick={() => navigate("/pricing")} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                        Voir les plans
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Compte</div>
                <h1 className="font-display text-4xl tracking-tighter mb-10 flex items-center gap-3">
                    <Crown className="text-[#E8D2A6]" /> Mon abonnement
                </h1>

                <div className="rounded-2xl border border-[#E8D2A6]/30 bg-gradient-to-b from-[#171208] to-[#0a0a0a] p-8 mb-6">
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="text-xs uppercase tracking-widest text-[#E8D2A6]">Plan actuel</div>
                            <div className="font-display text-3xl capitalize mt-1" data-testid="sub-plan">{user.premium_plan || sub?.plan}</div>
                            <div className="text-sm text-neutral-400 mt-1">Facturation {sub?.interval === "yearly" ? "annuelle" : "mensuelle"}</div>
                        </div>
                        <div className="text-right">
                            <div className="font-display text-3xl">{formatMoney(sub?.amount, sub?.currency)}</div>
                            <div className="text-xs text-neutral-500">/ {sub?.interval === "yearly" ? "an" : "mois"}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 py-6 border-y border-[#262626]">
                        <div>
                            <div className="text-xs uppercase tracking-widest text-neutral-500 flex items-center gap-1.5 mb-1"><Calendar size={12} /> Prochaine facture</div>
                            <div data-testid="sub-next-billing" className="text-white">{formatDate(sub?.next_billing_date || user.premium_until)}</div>
                        </div>
                        <div>
                            <div className="text-xs uppercase tracking-widest text-neutral-500 flex items-center gap-1.5 mb-1"><CreditCard size={12} /> Statut</div>
                            <div className="text-white">
                                {sub?.cancel_at_period_end
                                    ? <span className="text-yellow-400">Annulation à la fin de la période</span>
                                    : <span className="text-emerald-400">Actif</span>}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        {sub?.stripe_subscription_id ? (
                            sub?.cancel_at_period_end ? (
                                <Button
                                    onClick={resume}
                                    disabled={busy}
                                    data-testid="resume-btn"
                                    className="bg-emerald-500 text-black hover:bg-emerald-400 rounded-full h-11 px-6 font-semibold"
                                >
                                    <RefreshCw size={14} className="mr-2" /> Réactiver
                                </Button>
                            ) : (
                                <Button
                                    onClick={cancel}
                                    disabled={busy}
                                    data-testid="cancel-btn"
                                    variant="outline"
                                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-full h-11 px-6 bg-transparent"
                                >
                                    <XCircle size={14} className="mr-2" /> Annuler l&apos;abonnement
                                </Button>
                            )
                        ) : null}
                        <Button
                            onClick={() => navigate("/pricing")}
                            variant="outline"
                            className="border-[#262626] text-white hover:bg-white/5 rounded-full h-11 px-6 bg-transparent"
                        >
                            <ExternalLink size={14} className="mr-2" /> Changer de plan
                        </Button>
                    </div>
                </div>

                <div className="text-xs text-neutral-500">
                    La gestion complète de facturation, factures et méthodes de paiement se fait via Stripe. En cas de question,
                    contactez le support.
                </div>

                <div className="mt-10 p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Avantages Premium</div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-neutral-300">
                        <li>• 4 profils personnalisés</li>
                        <li>• Streaming 4K UHD + HDR</li>
                        <li>• Sans publicité</li>
                        <li>• Bande-annonce cinéma sur l&apos;accueil</li>
                        <li>• 4 écrans simultanés</li>
                        <li>• Nouveautés en accès anticipé</li>
                    </ul>
                    <Link to="/profiles" className="mt-4 inline-block text-[#E8D2A6] text-sm hover:underline">
                        → Gérer mes profils
                    </Link>
                </div>
            </div>
        </div>
    );
}
