import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Heart, ShieldCheck } from "lucide-react";
import Header from "@/components/Header";

const SUMUP_DON = "https://pay.sumup.com/b2c/QAF7K65H";

export default function DonPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <main className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#E8D2A6]/40 bg-[#E8D2A6]/10 text-[#E8D2A6]">
                    <Heart size={24} fill="currentColor" />
                </div>
                <h1 className="mt-6 font-display text-3xl sm:text-4xl">Faire un don</h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
                    Le paiement se fait de façon sécurisée sur SumUp, notre prestataire de paiement.
                    Tu choisis toi-même le montant sur leur page.
                </p>

                <a
                    href={SUMUP_DON}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#E8D2A6] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_0_30px_rgba(232,210,166,0.15)] transition-colors hover:bg-[#D4BB8B]"
                    data-testid="don-sumup-link"
                >
                    <Heart size={16} fill="currentColor" /> Payer avec SumUp
                </a>

                <p className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600">
                    <ShieldCheck size={13} /> Paiement chiffré, géré entièrement par SumUp.
                </p>

                <Link
                    to="/cagnotte"
                    className="mt-10 inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
                >
                    <ArrowLeft size={13} /> Retour à la cagnotte
                </Link>
            </main>
        </div>
    );
}