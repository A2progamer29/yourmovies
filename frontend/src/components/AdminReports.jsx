import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Flag, Check, Trash2, RotateCcw, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

function quand(valeur) {
    if (!valeur) return "";
    const d = new Date(valeur);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminReports({ onCount }) {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [voirTraites, setVoirTraites] = useState(false);

    const charger = useCallback(async () => {
        try {
            const r = await api.get("/admin/reports");
            setItems(r.data.items || []);
            onCount?.(r.data.open || 0);
        } catch (e) { showError(toast, e, "Chargement des signalements impossible"); }
    }, [onCount]);

    useEffect(() => { charger(); }, [charger]);

    const basculer = async (report) => {
        try {
            const r = await api.patch(`/admin/reports/${report.id}`);
            setItems((liste) => liste.map((x) => (x.id === report.id ? { ...x, handled: r.data.handled } : x)));
            onCount?.((items.filter((x) => !x.handled).length) + (r.data.handled ? -1 : 1));
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
    };

    const supprimer = async (report) => {
        if (!window.confirm("Supprimer ce signalement ?")) return;
        try {
            await api.delete(`/admin/reports/${report.id}`);
            await charger();
        } catch (e) { showError(toast, e, "Suppression impossible"); }
    };

    const liste = items.filter((r) => voirTraites || !r.handled);
    const traites = items.filter((r) => r.handled).length;

    return (
        <div className="space-y-4" data-testid="admin-reports">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <Flag size={15} className="text-amber-400" />
                    {items.filter((r) => !r.handled).length} signalement(s) en attente
                </div>
                {traites > 0 && (
                    <button
                        type="button"
                        onClick={() => setVoirTraites((v) => !v)}
                        data-testid="toggle-handled"
                        className="rounded-full border border-[#262626] px-3 py-1 text-xs text-neutral-400 transition-colors hover:border-[#E8D2A6]/50 hover:text-white"
                    >
                        {voirTraites ? "Masquer les traités" : `Voir les ${traites} traité(s)`}
                    </button>
                )}
            </div>

            {liste.length === 0 ? (
                <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-10 text-center">
                    <Inbox size={20} className="mx-auto mb-3 text-neutral-600" />
                    <p className="text-sm text-neutral-400">Aucun signalement en attente.</p>
                    <p className="mt-1 text-xs text-neutral-600">
                        Les problèmes remontés depuis les fiches et le lecteur arrivent ici.
                    </p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {liste.map((report) => (
                        <div
                            key={report.id}
                            className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 ${report.handled ? "border-[#1a1a1a] bg-[#0a0a0a] opacity-60" : "border-amber-500/25 bg-amber-500/[0.04]"}`}
                        >
                            {report.media_poster
                                ? <img src={report.media_poster} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                                : <div className="h-14 w-10 shrink-0 rounded bg-[#111]" />}

                            <div className="min-w-0 flex-1">
                                <button
                                    type="button"
                                    onClick={() => navigate(`/admin/media/${report.media_id}/edit`)}
                                    className="truncate text-sm text-white transition-colors hover:text-[#E8D2A6]"
                                >
                                    {report.media_title}
                                </button>
                                <div className="mt-0.5 text-xs text-amber-300">
                                    {report.reason_label}
                                    {report.season_number ? ` · S${report.season_number}E${report.episode_number}` : ""}
                                </div>
                                {report.message && (
                                    <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">« {report.message} »</p>
                                )}
                                <div className="mt-1.5 text-[11px] text-neutral-600">
                                    {report.user_name} · {quand(report.created_at)}
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => basculer(report)}
                                    title={report.handled ? "Remettre en attente" : "Marquer comme traité"}
                                    className="text-neutral-400 hover:bg-white/5 hover:text-[#E8D2A6]"
                                >
                                    {report.handled ? <RotateCcw size={14} /> : <Check size={15} />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => supprimer(report)}
                                    title="Supprimer"
                                    className="text-neutral-400 hover:bg-white/5 hover:text-red-400"
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
