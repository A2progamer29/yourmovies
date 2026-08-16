import React, { useEffect, useRef, useState } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { surAttenteReseau } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const DISCORD = "https://discord.gg/6mGTfvcNeD";

// Au-delà de cette attente, le chargement n'est plus une lenteur passagère :
// le serveur sort de veille, ou quelque chose ne répond pas.
const SEUIL_MS = 15000;

export default function AideChargement() {
    const [depuis, setDepuis] = useState(null);
    const [ouvert, setOuvert] = useState(false);
    // Une fois la fenêtre fermée, on ne la représente plus de la visite :
    // proposer deux fois la même aide devient du harcèlement.
    const ecarte = useRef(false);

    useEffect(() => surAttenteReseau(setDepuis), []);

    useEffect(() => {
        // Plus rien en attente : la page a fini de charger, on referme.
        if (!depuis) { setOuvert(false); return undefined; }
        if (ecarte.current) return undefined;
        const restant = Math.max(0, SEUIL_MS - (Date.now() - depuis));
        const minuterie = window.setTimeout(() => setOuvert(true), restant);
        return () => window.clearTimeout(minuterie);
    }, [depuis]);

    const fermer = () => {
        ecarte.current = true;
        setOuvert(false);
    };

    return (
        <Dialog open={ouvert} onOpenChange={(v) => { if (!v) fermer(); }}>
            <DialogContent
                className="max-w-md border-[#262626] bg-[#0a0a0a] text-white"
                data-testid="aide-chargement"
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-display text-xl">
                        <LifeBuoy size={18} className="shrink-0 text-[#E8D2A6]" />
                        Ça prend plus de temps que prévu
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-neutral-400">
                        Le serveur se remet sûrement en route — après une période sans visite, il
                        peut mettre jusqu&apos;à une minute à répondre. Laisse la page ouverte, elle
                        se chargera toute seule.
                    </DialogDescription>
                </DialogHeader>

                <p className="text-sm leading-relaxed text-neutral-400">
                    Si rien ne vient au bout de deux minutes, ce n&apos;est pas normal. Viens le dire
                    sur le Discord : c&apos;est là qu&apos;on répond le plus vite, et ça nous aide à
                    repérer les pannes.
                </p>

                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <Button
                        asChild
                        className="flex-1 rounded-full bg-[#E8D2A6] font-semibold text-black hover:bg-[#D4BB8B]"
                    >
                        <a href={DISCORD} target="_blank" rel="noopener noreferrer">
                            <MessageCircle size={15} className="mr-2" /> Demander de l&apos;aide
                        </a>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={fermer}
                        data-testid="aide-attendre"
                        className="rounded-full border-[#262626] bg-transparent text-white hover:bg-white/5"
                    >
                        J&apos;attends
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
