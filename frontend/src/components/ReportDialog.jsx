import React, { useState } from "react";
import { toast } from "sonner";
import { Flag, Send, PlayCircle, Image, Volume2, Captions, ShuffleIcon, MoreHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const MOTIFS = [
    { id: "player", label: "Ne démarre pas", icone: PlayCircle },
    { id: "quality", label: "Qualité d'image", icone: Image },
    { id: "sound", label: "Son", icone: Volume2 },
    { id: "subtitles", label: "Sous-titres", icone: Captions },
    { id: "wrong", label: "Mauvais contenu", icone: ShuffleIcon },
    { id: "other", label: "Autre", icone: MoreHorizontal },
];

export default function ReportDialog({ mediaId, episode, variant = "bouton" }) {
    const [ouvert, setOuvert] = useState(false);
    const [motif, setMotif] = useState(null);
    const [message, setMessage] = useState("");
    const [envoi, setEnvoi] = useState(false);

    const fermer = (etat) => {
        setOuvert(etat);
        if (!etat) { setMotif(null); setMessage(""); }
    };

    const envoyer = async () => {
        if (!motif) return;
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
            fermer(false);
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
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-[#E8D2A6]"
        >
            <Flag size={12} /> Signaler un problème
        </button>
    ) : (
        <Button
            variant="outline"
            data-testid="report-trigger"
            className="h-12 rounded-full border-[#262626] bg-transparent px-5 text-white hover:border-[#E8D2A6]/50 hover:bg-white/5"
        >
            <Flag size={15} className="mr-2" /> Signaler
        </Button>
    );

    return (
        <Dialog open={ouvert} onOpenChange={fermer}>
            <DialogTrigger asChild>{declencheur}</DialogTrigger>
            <DialogContent className="max-w-md gap-0 border-[#262626] bg-[#0a0a0a] p-0">
                <DialogHeader className="space-y-1 border-b border-[#1a1a1a] px-5 py-4 text-left">
                    <DialogTitle className="flex items-center gap-2 font-display text-lg tracking-tight text-white">
                        <Flag size={15} className="text-[#E8D2A6]" /> Signaler un problème
                    </DialogTitle>
                    <DialogDescription className="text-xs leading-relaxed text-neutral-500">
                        {episode
                            ? `Saison ${episode.season_number} · Épisode ${episode.episode_number}`
                            : "Ça nous arrive directement, et ça aide à corriger vite."}
                    </DialogDescription>
                </DialogHeader>

                <div className="px-5 py-4">
                    <div className="grid grid-cols-2 gap-2">
                        {MOTIFS.map(({ id, label, icone: Icone }) => {
                            const actif = motif === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setMotif(id)}
                                    data-testid={`report-reason-${id}`}
                                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors ${actif
                                        ? "border-[#E8D2A6] bg-[#E8D2A6]/10 text-[#E8D2A6]"
                                        : "border-[#1f1f1f] bg-[#111] text-neutral-400 hover:border-[#333] hover:text-neutral-200"}`}
                                >
                                    <Icone size={14} className="shrink-0" />
                                    <span className="min-w-0 truncate">{label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {motif && (
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Un détail qui aide à retrouver le problème (facultatif)"
                            maxLength={500}
                            rows={2}
                            data-testid="report-message"
                            className="mt-3 resize-none border-[#1f1f1f] bg-[#111] text-sm text-white placeholder:text-neutral-600"
                        />
                    )}
                </div>

                <div className="flex items-center gap-3 border-t border-[#1a1a1a] px-5 py-3.5">
                    <span className="min-w-0 flex-1 text-[11px] text-neutral-600">
                        {motif ? "Merci, ça prend deux secondes." : "Choisis ce qui ne va pas."}
                    </span>
                    <Button
                        onClick={envoyer}
                        disabled={envoi || !motif}
                        data-testid="report-send"
                        className="h-9 shrink-0 rounded-full bg-[#E8D2A6] px-4 text-xs font-semibold text-black hover:bg-[#D4BB8B] disabled:bg-[#161616] disabled:text-neutral-600"
                    >
                        <Send size={13} className="mr-1.5" /> Envoyer
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
