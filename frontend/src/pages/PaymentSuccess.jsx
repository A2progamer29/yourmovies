import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

export default function PaymentSuccess() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const [status, setStatus] = useState("polling"); // polling | paid | failed | timeout
    const sessionId = searchParams.get("session_id");

    useEffect(() => {
        if (!sessionId) {
            setStatus("failed");
            return;
        }
        let attempts = 0;
        const maxAttempts = 15;
        const interval = setInterval(async () => {
            attempts += 1;
            try {
                const r = await api.get(`/payments/status/${sessionId}`);
                if (r.data.payment_status === "paid") {
                    clearInterval(interval);
                    setStatus("paid");
                    refresh();
                    return;
                }
                if (["failed", "expired"].includes(r.data.payment_status)) {
                    clearInterval(interval);
                    setStatus("failed");
                    return;
                }
            } catch (e) { }
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                setStatus("timeout");
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [sessionId, refresh]);

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-md mx-auto px-6 py-24 text-center">
                {status === "polling" && (
                    <>
                        <Loader2 size={40} className="mx-auto animate-spin text-[#E8D2A6] mb-6" />
                        <h1 className="font-display text-3xl mb-3">Confirmation du paiement...</h1>
                        <p className="text-neutral-400">Merci de patienter, nous validons votre abonnement.</p>
                    </>
                )}
                {status === "paid" && (
                    <>
                        <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-6" />
                        <h1 className="font-display text-4xl mb-3">Bienvenue !</h1>
                        <p className="text-neutral-400 mb-8">Votre abonnement est actif. Profitez de YourMovie&apos;s sans publicité.</p>
                        <Button onClick={() => navigate("/")} data-testid="go-home-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                            Explorer le catalogue
                        </Button>
                    </>
                )}
                {status === "failed" && (
                    <>
                        <XCircle size={48} className="mx-auto text-red-400 mb-6" />
                        <h1 className="font-display text-3xl mb-3">Paiement non abouti</h1>
                        <p className="text-neutral-400 mb-8">Le paiement a été annulé ou a échoué.</p>
                        <Link to="/pricing" className="text-[#E8D2A6] hover:underline">Réessayer</Link>
                    </>
                )}
                {status === "timeout" && (
                    <>
                        <h1 className="font-display text-3xl mb-3">Vérification en cours</h1>
                        <p className="text-neutral-400 mb-8">Le paiement peut prendre encore quelques instants. Rechargez la page ou revenez plus tard.</p>
                        <Button onClick={() => navigate("/")} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                            Retour à l&apos;accueil
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
