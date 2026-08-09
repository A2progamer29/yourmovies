import React, { useEffect, useState } from "react";
import {
  Ticket,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  CreditCard,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISCORD_URL = "https://discord.gg/6mGTfvcNeD";
const PAYMENTS = ["Carte bancaire", "PayPal", "Paysafecard", "& plus"];

function DiscordIcon({ size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

export default function DiscordCheckoutDialog({
  open,
  onOpenChange,
  offerLabel,
  kind = "subscription",
  sellAuthUrl = "",
}) {
  const [copied, setCopied] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const ticketText = kind === "donation" ? offerLabel : `Offre : ${offerLabel}`;
  const showPaymentChoice =
    kind === "subscription" &&
    Boolean(sellAuthUrl) &&
    paymentMethod !== "discord";

  useEffect(() => {
    if (!open) {
      setPaymentMethod(null);
      setCopied(false);
    }
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticketText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const steps = [
    <>
      Rejoins notre serveur{" "}
      <span className="text-white font-medium">Discord</span>.
    </>,
    <>
      Ouvre le salon{" "}
      <span className="px-1.5 py-0.5 rounded bg-[#5865F2]/15 text-[#8b93f5] font-medium">
        #ticket
      </span>
      .
    </>,
    <>
      Crée un ticket en précisant ton offre :{" "}
      <span className="text-[#E8D2A6] font-medium">{offerLabel}</span>.
    </>,
    <>
      Choisis ton moyen de paiement — un membre de l&apos;équipe finalise avec
      toi.
    </>,
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white sm:max-w-xl p-7 gap-5">
        {showPaymentChoice ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl sm:text-3xl flex items-center gap-2.5">
                <ShieldCheck size={24} className="text-[#E8D2A6]" /> Choisir le
                paiement
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-neutral-400 -mt-2 leading-relaxed">
              Sélectionne la méthode que tu préfères pour finaliser ton
              abonnement.
            </p>

            <div className="rounded-xl border border-[#262626] bg-[#111] p-4">
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5 mb-1.5">
                <Ticket size={12} className="text-[#E8D2A6]" /> Ton offre
              </div>
              <div className="text-white font-medium">{offerLabel}</div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#E8D2A6]/45 bg-gradient-to-b from-[#E8D2A6]/10 to-[#111] p-5 flex flex-col">
                <div className="w-10 h-10 rounded-full bg-[#E8D2A6]/15 text-[#E8D2A6] flex items-center justify-center mb-4">
                  <CreditCard size={19} />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[#E8D2A6] mb-1">
                  Paiement en ligne
                </div>
                <h3 className="font-display text-xl mb-2">SellAuth</h3>
                <p className="text-xs text-neutral-400 leading-relaxed mb-5">
                  Choisis la durée indiquée ci-dessus sur SellAuth, puis règle
                  ta commande en ligne.
                </p>
                <a
                  href={sellAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex items-center justify-center gap-2 w-full h-11 rounded-full font-semibold bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] transition-colors"
                >
                  Payer via SellAuth <ExternalLink size={15} />
                </a>
              </div>

              <div className="rounded-2xl border border-[#262626] bg-[#111] p-5 flex flex-col">
                <div className="w-10 h-10 rounded-full bg-[#5865F2]/15 text-[#8b93f5] flex items-center justify-center mb-4">
                  <DiscordIcon size={19} />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[#8b93f5] mb-1">
                  Paiement accompagné
                </div>
                <h3 className="font-display text-xl mb-2">Discord</h3>
                <p className="text-xs text-neutral-400 leading-relaxed mb-5">
                  Ouvre un ticket et finalise ton paiement avec un membre de
                  l&apos;équipe.
                </p>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("discord")}
                  className="mt-auto inline-flex items-center justify-center gap-2 w-full h-11 rounded-full font-semibold bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
                >
                  Continuer via Discord <ArrowRight size={15} />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 flex items-center justify-center gap-1.5 text-center">
              <ShieldCheck size={12} className="text-[#E8D2A6] shrink-0" />{" "}
              Vérifie la formule et la durée avant de confirmer ton paiement.
            </p>
          </>
        ) : (
          <>
            {kind === "subscription" && sellAuthUrl && (
              <button
                type="button"
                onClick={() => setPaymentMethod(null)}
                className="w-fit inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-[#E8D2A6] transition-colors"
              >
                <ChevronLeft size={14} /> Retour aux moyens de paiement
              </button>
            )}

            <DialogHeader>
              <DialogTitle className="font-display text-2xl sm:text-3xl flex items-center gap-2.5">
                <DiscordIcon size={24} className="text-[#5865F2]" /> Finaliser
                sur Discord
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-neutral-400 -mt-2 leading-relaxed">
              Le paiement se fait via notre Discord, en quelques minutes. Suis
              ces étapes :
            </p>

            <div className="rounded-xl border border-[#262626] bg-[#111] p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5 mb-1.5">
                  <Ticket size={12} className="text-[#E8D2A6]" /> Ton offre
                </div>
                <div className="text-white font-medium truncate">
                  {offerLabel}
                </div>
              </div>
              <button
                onClick={copy}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full border border-[#262626] text-neutral-300 hover:border-[#E8D2A6]/50 hover:text-[#E8D2A6] transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={14} /> Copié
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copier
                  </>
                )}
              </button>
            </div>

            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3.5 text-[15px] text-neutral-300"
                >
                  <span className="shrink-0 w-7 h-7 rounded-full bg-[#5865F2]/15 text-[#8b93f5] text-sm font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed pt-0.5">{s}</span>
                </li>
              ))}
            </ol>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2.5">
                Moyens de paiement acceptés
              </div>
              <div className="flex flex-wrap gap-2">
                {PAYMENTS.map((p) => (
                  <span
                    key={p}
                    className="text-[13px] px-3.5 py-2 rounded-full border border-[#262626] bg-[#111] text-neutral-300"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-full font-semibold bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
            >
              <DiscordIcon size={18} /> Rejoindre le Discord{" "}
              <ArrowRight size={16} />
            </a>

            <p className="-mt-1 text-[11px] text-neutral-500 flex items-center justify-center gap-1.5 text-center">
              <ShieldCheck size={12} className="text-[#E8D2A6] shrink-0" />{" "}
              Traitement manuel par l&apos;équipe. Ton Premium est activé après
              confirmation.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
