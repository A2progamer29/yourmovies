import React, { useEffect, useState } from "react";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const DISCORD = "https://discord.gg/6mGTfvcNeD";

/**
 * Avertit qu'un contenu pose problème, soit parce qu'un administrateur l'a
 * déclaré, soit parce que plusieurs visiteurs l'ont signalé. Une seule fois par
 * titre et par visite : répéter l'avertissement à chaque page le rendrait
 * invisible.
 */
export default function AvertissementContenu({ media }) {
    const [ouvert, setOuvert] = useState(false);

    const declare = Boolean(media?.player_broken);
    const signale = Boolean(media?.reports_flagged);
    const cle = media?.id ? `ym_avert_${media.id}` : null;

    useEffect(() => {
        if (!cle || (!declare && !signale)) return;
        try {
            if (window.sessionStorage.getItem(cle) === "1") return;
        } catch { }
        setOuvert(true);
    }, [cle, declare, signale]);

    const fermer = () => {
        setOuvert(false);
        try { if (cle) window.sessionStorage.setItem(cle, "1"); } catch { }
    };

    if (!declare && !signale) return null;

    return (
        <Dialog open={ouvert} onOpenChange={(v) => { if (!v) fermer(); }}>
            <DialogContent
                className="max-w-md border-[#262626] bg-[#0a0a0a] text-white"
                data-testid="avertissement-contenu"
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-display text-xl">
                        <AlertTriangle size={18} className="shrink-0 text-amber-400" />
                        Ce titre pose problème
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-neutral-400">
                        {declare
                            ? (media.player_notice
                                || "Le lecteur de ce contenu est momentanément indisponible. Nous travaillons à le rétablir.")
                            : "Plusieurs personnes ont signalé un problème sur ce titre. La lecture risque de ne pas fonctionner correctement."}
                    </DialogDescription>
                </DialogHeader>

                <p className="text-sm leading-relaxed text-neutral-400">
                    Tu peux quand même essayer — le problème ne touche parfois qu&apos;un épisode ou
                    une qualité. Si ça ne marche pas, viens le dire sur le Discord : c&apos;est ce qui
                    nous permet de corriger vite.
                </p>

                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <Button
                        onClick={fermer}
                        data-testid="avert-continuer"
                        className="flex-1 rounded-full bg-[#E8D2A6] font-semibold text-black hover:bg-[#D4BB8B]"
                    >
                        J&apos;ai compris
                    </Button>
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-full border-[#262626] bg-transparent text-white hover:bg-white/5"
                    >
                        <a href={DISCORD} target="_blank" rel="noopener noreferrer">
                            <MessageCircle size={14} className="mr-2" /> Discord
                        </a>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
