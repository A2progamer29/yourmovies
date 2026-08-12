import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, X, Lock, Unlock, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminPolls() {
    const [sondages, setSondages] = useState([]);
    const [question, setQuestion] = useState("");
    const [choix, setChoix] = useState(["", ""]);
    const [occupe, setOccupe] = useState(false);

    const charger = useCallback(async () => {
        try {
            const r = await api.get("/admin/polls");
            setSondages(Array.isArray(r.data) ? r.data : []);
        } catch (e) { showError(toast, e, "Chargement des sondages impossible"); }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const creer = async () => {
        const options = choix.map((c) => c.trim()).filter(Boolean);
        if (question.trim().length < 3) { toast.error("Écris une question"); return; }
        if (options.length < 2) { toast.error("Il faut au moins deux choix"); return; }
        setOccupe(true);
        try {
            await api.post("/admin/polls", { question: question.trim(), options });
            toast.success("Sondage publié — les visiteurs sont notifiés");
            setQuestion("");
            setChoix(["", ""]);
            await charger();
        } catch (e) { showError(toast, e, "Publication impossible"); }
        finally { setOccupe(false); }
    };

    const basculer = async (sondage) => {
        try {
            const r = await api.patch(`/admin/polls/${sondage.id}`);
            setSondages((liste) => liste.map((s) => (s.id === sondage.id ? { ...s, closed: r.data.closed } : s)));
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
    };

    const supprimer = async (sondage) => {
        if (!window.confirm(`Supprimer « ${sondage.question} » et tous ses votes ?`)) return;
        try {
            await api.delete(`/admin/polls/${sondage.id}`);
            toast.success("Sondage supprimé");
            await charger();
        } catch (e) { showError(toast, e, "Suppression impossible"); }
    };

    return (
        <div className="grid gap-8 lg:grid-cols-2" data-testid="admin-polls">
            <div className="h-fit rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                <div className="mb-4 flex items-center gap-2">
                    <BarChart3 size={16} className="text-[#E8D2A6]" />
                    <h3 className="font-medium text-white">Nouveau sondage</h3>
                </div>
                <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ta question…"
                    maxLength={200}
                    data-testid="poll-question"
                    className="border-[#262626] bg-[#111] text-white"
                />
                <div className="mt-3 space-y-2">
                    {choix.map((valeur, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Input
                                value={valeur}
                                onChange={(e) => setChoix((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                                placeholder={`Choix ${i + 1}`}
                                maxLength={120}
                                className="border-[#262626] bg-[#111] text-white"
                            />
                            {choix.length > 2 && (
                                <button
                                    type="button"
                                    onClick={() => setChoix((c) => c.filter((_, j) => j !== i))}
                                    className="shrink-0 text-neutral-600 hover:text-red-400"
                                    aria-label={`Retirer le choix ${i + 1}`}
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                {choix.length < 10 && (
                    <button
                        type="button"
                        onClick={() => setChoix((c) => [...c, ""])}
                        className="mt-3 text-xs text-[#E8D2A6] hover:underline"
                    >
                        + Ajouter un choix
                    </button>
                )}
                <Button
                    onClick={creer}
                    disabled={occupe}
                    data-testid="create-poll"
                    className="mt-5 w-full rounded-full bg-[#E8D2A6] font-semibold text-black hover:bg-[#D4BB8B]"
                >
                    <Plus size={15} className="mr-2" /> Publier
                </Button>
                <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
                    Le sondage apparaît aussitôt sur la page Sondages et dans la cloche de notifications.
                </p>
            </div>

            <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Sondages publiés</div>
                {sondages.length === 0 && (
                    <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-6 text-center text-sm text-neutral-500">
                        Aucun sondage.
                    </div>
                )}
                {sondages.map((sondage) => (
                    <div key={sondage.id} className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-4">
                        <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-white">{sondage.question}</div>
                                <div className="mt-0.5 text-[11px] text-neutral-500">
                                    {sondage.total_votes} vote{sondage.total_votes > 1 ? "s" : ""}
                                    {sondage.closed && " · clos"}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => basculer(sondage)}
                                    title={sondage.closed ? "Rouvrir" : "Clore"}
                                    className="text-neutral-400 hover:bg-white/5 hover:text-[#E8D2A6]"
                                >
                                    {sondage.closed ? <Unlock size={14} /> : <Lock size={14} />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => supprimer(sondage)}
                                    title="Supprimer"
                                    className="text-neutral-400 hover:bg-white/5 hover:text-red-400"
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                            {sondage.options.map((option, i) => (
                                <div key={i} className="relative overflow-hidden rounded-lg border border-[#1a1a1a] px-3 py-1.5">
                                    <div className="absolute inset-y-0 left-0 bg-[#E8D2A6]/10" style={{ width: `${option.percent}%` }} aria-hidden="true" />
                                    <div className="relative flex items-center gap-3 text-xs">
                                        <span className="min-w-0 flex-1 truncate text-neutral-300">{option.label}</span>
                                        <span className="shrink-0 tabular-nums text-neutral-500">{option.votes} · {option.percent}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
