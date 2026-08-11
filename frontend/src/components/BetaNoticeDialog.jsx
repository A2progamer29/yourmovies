import React, { useEffect, useState } from "react";
import { Rocket, ArrowRight, MessageSquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const DISCORD_URL = "https://discord.gg/6mGTfvcNeD";
const STORAGE_KEY = "ym_beta_notice_v1";

function DiscordIcon({ size = 18 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
        </svg>
    );
}

export default function BetaNoticeDialog() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let seen = false;
        try { seen = !!localStorage.getItem(STORAGE_KEY); } catch { }
        if (seen) return;
        const t = setTimeout(() => setOpen(true), 1400);
        return () => clearTimeout(t);
    }, []);

    const close = () => {
        try { localStorage.setItem(STORAGE_KEY, "1"); } catch { }
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
            <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl flex items-center gap-2.5">
                        <Rocket size={20} className="text-[#E8D2A6]" /> YourMovie&apos;s est en bêta
                    </DialogTitle>
                    <DialogDescription className="sr-only">Informations sur la phase de bêta du site.</DialogDescription>
                </DialogHeader>

                <p className="text-sm text-neutral-300 leading-relaxed">
                    Le site est encore en <span className="text-[#E8D2A6]">développement</span> — de nouvelles fonctionnalités arrivent et certaines choses peuvent encore bouger.
                </p>
                <p className="text-sm text-neutral-400 leading-relaxed -mt-1 flex items-start gap-2">
                    <MessageSquarePlus size={16} className="text-[#E8D2A6] shrink-0 mt-0.5" />
                    <span>Tes retours, bugs et suggestions sont les bienvenus : partage-les sur notre Discord, ça nous aide à améliorer YourMovie&apos;s.</span>
                </p>

                <a
                    href={DISCORD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    className="mt-2 inline-flex items-center justify-center gap-2 w-full h-12 rounded-full font-semibold bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
                >
                    <DiscordIcon size={18} /> Rejoindre le Discord <ArrowRight size={16} />
                </a>
                <button onClick={close} className="text-sm text-neutral-500 hover:text-neutral-300 mx-auto -mt-1">
                    J&apos;ai compris
                </button>
            </DialogContent>
        </Dialog>
    );
}
