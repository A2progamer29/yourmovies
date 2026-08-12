import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HardDrive, Loader2, Trash2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

function poids(octets) {
    const valeur = Number(octets) || 0;
    if (valeur < 1024 * 1024) return `${Math.round(valeur / 1024)} Ko`;
    if (valeur < 1024 * 1024 * 1024) return `${(valeur / (1024 * 1024)).toFixed(1)} Mo`;
    return `${(valeur / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

// Une suppression Bunny prend environ un tiers de seconde, et le serveur en
// lance huit de front : c'est ce rapport qui donne l'estimation affichee.
const SECONDES_PAR_VIDEO = 0.32 / 8;

function duree(secondes) {
    const total = Math.max(0, Math.ceil(secondes));
    if (total < 60) return `${total} s`;
    const minutes = Math.floor(total / 60);
    const reste = total % 60;
    return reste ? `${minutes} min ${reste} s` : `${minutes} min`;
}

function date(valeur) {
    if (!valeur) return "—";
    const d = new Date(valeur);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
}

export default function AdminStorage() {
    const [rapport, setRapport] = useState(null);
    const [analyse, setAnalyse] = useState(false);
    const [purge, setPurge] = useState(false);
    const [selection, setSelection] = useState([]);
    const [restant, setRestant] = useState(0);
    const compteur = useRef(null);

    useEffect(() => () => { if (compteur.current) window.clearInterval(compteur.current); }, []);

    const analyser = async () => {
        setAnalyse(true);
        try {
            const r = await api.get("/admin/bunny/orphans");
            setRapport(r.data);
            setSelection([]);
            const n = (r.data.orphans || []).length;
            toast.success(n === 0 ? "Aucune vidéo orpheline" : `${n} vidéo${n > 1 ? "s" : ""} orpheline${n > 1 ? "s" : ""}`);
        } catch (e) {
            showError(toast, e, "Analyse impossible");
        } finally {
            setAnalyse(false);
        }
    };

    const supprimer = async () => {
        if (selection.length === 0) return;
        const octets = (rapport?.orphans || [])
            .filter((o) => selection.includes(o.video_id))
            .reduce((total, o) => total + (Number(o.size_bytes) || 0), 0);
        if (!window.confirm(`Supprimer définitivement ${selection.length} vidéo(s) de Bunny Stream ?\n\nCes vidéos ne sont rattachées à aucun contenu du catalogue. L'opération est irréversible.`)) return;
        if (!window.confirm(`Dernière confirmation : ${poids(octets)} seront libérés et les fichiers seront perdus.`)) return;
        setPurge(true);
        // Le serveur ne renvoie qu'a la fin : le decompte est une projection a
        // partir du nombre de videos, d'ou le « environ » affiche.
        setRestant(Math.ceil(selection.length * SECONDES_PAR_VIDEO));
        if (compteur.current) window.clearInterval(compteur.current);
        compteur.current = window.setInterval(() => setRestant((v) => Math.max(0, v - 1)), 1000);
        try {
            const r = await api.post("/admin/bunny/orphans/purge", {
                video_ids: selection,
                library_id: rapport.library_id,
            });
            if (compteur.current) window.clearInterval(compteur.current);
            compteur.current = null;
            setRestant(0);
            toast.success(`${r.data.deleted} vidéo(s) supprimée(s)${r.data.skipped ? ` · ${r.data.skipped} ignorée(s)` : ""}`);
            // Rechargement plutôt qu'une nouvelle analyse : celle-ci reparcourt
            // toute la bibliothèque et donnait l'impression d'un chargement sans fin.
            window.setTimeout(() => window.location.reload(), 1200);
        } catch (e) {
            if (compteur.current) window.clearInterval(compteur.current);
            compteur.current = null;
            setRestant(0);
            setPurge(false);
            showError(toast, e, "Suppression impossible");
        }
    };

    const orphans = rapport?.orphans || [];
    const toutSelectionne = orphans.length > 0 && selection.length === orphans.length;
    const basculer = (videoId) => setSelection((liste) =>
        liste.includes(videoId) ? liste.filter((id) => id !== videoId) : [...liste, videoId]
    );
    const basculerTout = () => setSelection(toutSelectionne ? [] : orphans.map((o) => o.video_id));

    return (
        <div className="space-y-5" data-testid="admin-storage">
            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <HardDrive size={18} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                        <div>
                            <div className="text-sm font-medium text-white">Vidéos orphelines sur Bunny Stream</div>
                            <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-500">
                                Les fichiers restés en ligne alors que leur contenu a été retiré du catalogue.
                                Depuis maintenant, supprimer un contenu supprime aussi ses vidéos — cette analyse
                                sert à rattraper tout ce qui a été supprimé avant.
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={analyser}
                        disabled={analyse}
                        data-testid="scan-orphans"
                        className="shrink-0 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]"
                    >
                        {analyse ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
                        {analyse ? "Analyse…" : "Analyser la bibliothèque"}
                    </Button>
                </div>
            </div>

            {rapport && (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[
                            { label: "Vidéos sur Bunny", valeur: rapport.total_videos },
                            { label: "Orphelines", valeur: orphans.length, alerte: orphans.length > 0 },
                            { label: "Espace récupérable", valeur: poids(rapport.orphan_bytes) },
                        ].map((c) => (
                            <div key={c.label} className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-4">
                                <div className="text-[10px] uppercase tracking-widest text-neutral-500">{c.label}</div>
                                <div className={`mt-1.5 font-display text-2xl ${c.alerte ? "text-amber-400" : "text-white"}`}>{c.valeur}</div>
                            </div>
                        ))}
                    </div>

                    {orphans.length === 0 ? (
                        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5 text-sm text-emerald-200">
                            <CheckCircle2 size={16} className="shrink-0" />
                            Rien à nettoyer : chaque vidéo de la bibliothèque est rattachée à un contenu.
                        </div>
                    ) : (
                        <div className="rounded-xl border border-[#262626] bg-[#0a0a0a]">
                            <div className="flex flex-wrap items-center gap-3 border-b border-[#262626] px-5 py-3.5">
                                <Checkbox
                                    checked={toutSelectionne}
                                    onCheckedChange={basculerTout}
                                    aria-label="Tout sélectionner"
                                    data-testid="select-all-orphans"
                                    className="border-[#3a3a3a] data-[state=checked]:border-[#E8D2A6] data-[state=checked]:bg-[#E8D2A6] data-[state=checked]:text-black"
                                />
                                <span className="text-xs uppercase tracking-widest text-neutral-500">
                                    {selection.length === 0
                                        ? "Coche les vidéos à supprimer"
                                        : `${selection.length} sélectionnée${selection.length > 1 ? "s" : ""} · environ ${duree(selection.length * SECONDES_PAR_VIDEO)}`}
                                </span>
                                <Button
                                    onClick={supprimer}
                                    disabled={purge || selection.length === 0}
                                    data-testid="purge-orphans"
                                    className="ml-auto h-9 rounded-full bg-red-500/15 px-4 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:bg-[#161616] disabled:text-neutral-600"
                                >
                                    {purge ? <Loader2 size={13} className="mr-2 animate-spin" /> : <Trash2 size={13} className="mr-2" />}
                                    {purge
                                        ? (restant > 0 ? `Suppression… environ ${duree(restant)}` : "Presque terminé, la page va se recharger")
                                        : `Supprimer la sélection${selection.length > 0 ? ` (${selection.length})` : ""}`}
                                </Button>
                            </div>
                            <div className="max-h-[420px] overflow-y-auto">
                                {orphans.map((o) => {
                                    const coche = selection.includes(o.video_id);
                                    return (
                                        <label
                                            key={o.video_id}
                                            className={`flex cursor-pointer items-center gap-3 border-b border-[#1a1a1a] px-5 py-3 text-sm transition-colors last:border-b-0 ${coche ? "bg-[#E8D2A6]/[0.06]" : "hover:bg-white/[0.02]"}`}
                                        >
                                            <Checkbox
                                                checked={coche}
                                                onCheckedChange={() => basculer(o.video_id)}
                                                aria-label={`Sélectionner ${o.title}`}
                                                className="border-[#3a3a3a] data-[state=checked]:border-[#E8D2A6] data-[state=checked]:bg-[#E8D2A6] data-[state=checked]:text-black"
                                            />
                                            <span className="min-w-0 flex-1 truncate text-neutral-200">{o.title}</span>
                                            <span className="shrink-0 text-xs tabular-nums text-neutral-500">{date(o.created_at)}</span>
                                            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-neutral-400">{poids(o.size_bytes)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
