import React, { useState } from "react";
import { Ticket, Copy, Check, ShieldCheck, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DISCORD_URL = "https://discord.gg/8SZ8KPrjcQ";
const PAYMENTS = ["Carte bancaire", "PayPal", "Paysafecard", "Crypto", "& plus"];

function DiscordIcon({ size = 20, className = "" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
        </svg>
    );
}

export default function DiscordCheckoutDialog({ open, onOpenChange, offerLabel, kind = "subscription" }) {
    const [copied, setCopied] = useState(false);
    const ticketText = kind === "donation" ? offerLabel : `Offre : ${offerLabel}`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(ticketText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { }
    };

    const steps = [
        <>Rejoins notre serveur <span className="text-white font-medium">Discord</span>.</>,
        <>Ouvre le salon <span className="px-1.5 py-0.5 rounded bg-[#5865F2]/15 text-[#8b93f5] font-medium">#ticket</span>.</>,
        <>Crée un ticket en précisant ton offre : <span className="text-[#E8D2A6] font-medium">{offerLabel}</span>.</>,
        <>Choisis ton moyen de paiement — un membre de l&apos;équipe finalise avec toi.</>,
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl flex items-center gap-2.5">
                        <DiscordIcon size={22} className="text-[#5865F2]" /> Finaliser sur Discord
                    </DialogTitle>
                </DialogHeader>

                <p className="text-sm text-neutral-400 -mt-1">
                    Le paiement se fait via notre Discord, en quelques minutes. Suis ces étapes :
                </p>

                <div className="mt-1 rounded-xl border border-[#E8D2A6]/30 bg-gradient-to-br from-[#171208] to-[#0a0a0a] p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5 mb-1">
                            <Ticket size={12} className="text-[#E8D2A6]" /> Ton offre
                        </div>
                        <div className="text-white font-medium truncate">{offerLabel}</div>
                    </div>
                    <button
                        onClick={copy}
                        className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-[#262626] text-neutral-300 hover:border-[#E8D2A6]/50 hover:text-[#E8D2A6] transition-colors"
                    >
                        {copied ? <><Check size={13} /> Copié</> : <><Copy size={13} /> Copier</>}
                    </button>
                </div>

                <ol className="mt-4 space-y-3">
                    {steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-neutral-300">
                            <span className="shrink-0 w-6 h-6 rounded-full bg-[#5865F2]/15 text-[#8b93f5] text-xs font-semibold flex items-center justify-center mt-0.5">
                                {i + 1}
                            </span>
                            <span className="leading-relaxed">{s}</span>
                        </li>
                    ))}
                </ol>

                <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Moyens de paiement acceptés</div>
                    <div className="flex flex-wrap gap-2">
                        {PAYMENTS.map((p) => (
                            <span key={p} className="text-xs px-3 py-1.5 rounded-full border border-[#262626] bg-[#111] text-neutral-300">
                                {p}
                            </span>
                        ))}
                    </div>
                </div>

                <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center justify-center gap-2 w-full h-12 rounded-full font-semibold bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
                >
                    <DiscordIcon size={18} /> Rejoindre le Discord <ArrowRight size={16} />
                </a>

                <p className="mt-3 text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
                    <ShieldCheck size={12} className="text-[#E8D2A6]" /> Traitement manuel par l&apos;équipe. Ton Premium est activé après confirmation.
                </p>
            </DialogContent>
        </Dialog>
    );
}
