import React, { useState } from "react";
import { toast } from "sonner";
import { Flag, Send } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const MOTIFS = [
    { id: "player", label: "Le lecteur ne démarre pas" },
    { id: "quality", label: "Mauvaise qualité d'image" },
    { id: "sound", label: "Problème de son" },
    { id: "subtitles", label: "Sous-titres absents ou décalés" },
    { id: "wrong", label: "Ce n'est pas le bon contenu" },
    { id: "other", label: "Autre" },
];

export default function ReportDialog({ mediaId, episode, variant = "bouton" }) {
    const [ouvert, setOuvert] = useState(false);
    const [motif, setMotif] = useState(null);
    const [message, setMessage] = useState("");
    const [envoi, setEnvoi] = useState(false);

    const envoyer = async () => {
        if (!motif) { toast.error("Choisis un motif"); return; }
        setEnvoi(true);
        try {
            await api.post("/reports", {
                media_id: mediaId,
                reason: motif,
                message: message.trim(),
                season_number: episode?.season_number ?? null,
                episode_number: episode?.episode_number ?? null,
            });
            toast.success("Merci, le problème est signalé.");
            setOuvert(false);
            setMotif(null);
            setMessage("");
        } catch (e) {
            showError(toast, e, "Signalement impossible");
        } finally {
            setEnvoi(false);
        }
    };

    const declencheur = variant === "discret" ? (
        <button
            type="button"
            data-testid="report-trigger"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-amber-300"
        >
            <Flag size={12} /> Signaler un problème
        </button>
    ) : (
        <Button
            variant="outline"
            data-testid="report-trigger"
            className="h-12 rounded-full border-[#262626] bg-transparent px-5 text-white hover:border-amber-400/50 hover:bg-white/5"
        >
            <Flag size={15} className="mr-2" /> Signaler
        </Button>
    );

    return (
        <Dialog open={ouvert} onOpenChange={setOuvert}>
            <DialogTrigger asChild>{declencheur}</DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl">Signaler un problème</DialogTitle>
                    <DialogDescription className="text-sm text-neutral-400">
                        Dis-nous ce qui ne va pas. C&apos;est anonyme si tu n&apos;es pas connecté, et ça arrive
                        directement dans le panneau de gestion.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-1.5">
                    {MOTIFS.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => setMotif(m.id)}
                            data-testid={`report-reason-${m.id}`}
                            className={`w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${motif === m.id
                                ? "border-[#E8D2A6] bg-[#E8D2A6]/[0.08] text-[#E8D2A6]"
                                : "border-[#262626] bg-[#111] text-neutral-300 hover:border-[#E8D2A6]/50"}`}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>

                <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Un détail qui peut aider (facultatif) — épisode concerné, moment du problème…"
                    maxLength={500}
                    rows={3}
                    className="border-[#262626] bg-[#111] text-sm text-white"
                />

                <Button
                    onClick={envoyer}
                    disabled={envoi || !motif}
                    data-testid="report-send"
                    className="w-full rounded-full bg-[#E8D2A6] font-semibold text-black hover:bg-[#D4BB8B] disabled:bg-[#161616] disabled:text-neutral-600"
                >
                    <Send size={14} className="mr-2" /> Envoyer le signalement
                </Button>
            </DialogContent>
        </Dialog>
    );
}
