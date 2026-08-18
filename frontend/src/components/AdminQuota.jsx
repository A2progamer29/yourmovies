import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Target, Check, Save } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function jourCourt(valeur) {
    const d = new Date(`${valeur}T12:00:00`);
    if (Number.isNaN(d.getTime())) return valeur;
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export default function AdminQuota({ peutRegler }) {
    const [donnees, setDonnees] = useState(null);
    const [occupe, setOccupe] = useState(false);
    const [cible, setCible] = useState("");

    const charger = useCallback(async (silencieux) => {
        if (!silencieux) setOccupe(true);
        try {
            const r = await api.get("/admin/quota", { silent: true });
            setDonnees(r.data);
            setCible(String(r.data.cible));
        } catch (e) {
            showError(toast, e, "Quota indisponible");
        } finally {
            setOccupe(false);
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const enregistrer = async () => {
        const valeur = Number(cible);
        if (!Number.isFinite(valeur) || valeur < 1) {
            toast.error("L'objectif doit être d'au moins 1 contenu.");
            return;
        }
        setOccupe(true);
        try {
            await api.post("/admin/quota", { cible: Math.round(valeur) });
            toast.success("Objectif enregistré");
            await charger(true);
        } catch (e) {
            showError(toast, e, "Enregistrement impossible");
        } finally {
            setOccupe(false);
        }
    };

    if (!donnees) {
        return (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" /> Lecture des dépôts du jour…
            </div>
        );
    }

    const enRetard = donnees.admins.filter((a) => !a.atteint);
    const avance = donnees.objectif_collectif
        ? Math.min(100, Math.round((donnees.total_du_jour / donnees.objectif_collectif) * 100))
        : 0;

    return (
        <div className="space-y-5" data-testid="admin-quota">
            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <Target size={18} className="text-[#E8D2A6]" />
                        <div>
                            <div className="text-sm font-medium text-white">
                                {donnees.total_du_jour} / {donnees.objectif_collectif} contenus déposés aujourd&apos;hui
                            </div>
                            <div className="mt-0.5 text-xs text-neutral-500">
                                {donnees.cible} par personne · journée du {donnees.date} ({donnees.fuseau})
                            </div>
                        </div>
                    </div>
                    <Button
                        onClick={() => charger()}
                        disabled={occupe}
                        data-testid="quota-actualiser"
                        className="h-8 rounded-full bg-[#161616] px-4 text-xs font-semibold text-neutral-300 hover:bg-[#1f1f1f]"
                    >
                        {occupe ? <Loader2 size={13} className="mr-2 animate-spin" /> : <RefreshCw size={13} className="mr-2" />}
                        Actualiser
                    </Button>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#161616]">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${avance >= 100 ? "bg-emerald-400" : "bg-[#E8D2A6]"}`}
                        style={{ width: `${avance}%` }}
                    />
                </div>

                <p className="mt-3 text-sm text-neutral-400">
                    {enRetard.length === 0
                        ? "Tout le monde a rempli son quota aujourd'hui."
                        : `${enRetard.length} personne${enRetard.length > 1 ? "s" : ""} n'${enRetard.length > 1 ? "ont" : "a"} pas encore atteint l'objectif.`}
                </p>
            </div>

            {peutRegler && (
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                    <label className="block">
                        <span className="text-[10px] uppercase tracking-widest text-neutral-500">Contenus par personne et par jour</span>
                        <Input
                            type="number"
                            min={1}
                            max={200}
                            value={cible}
                            onChange={(e) => setCible(e.target.value)}
                            data-testid="quota-cible"
                            className="mt-1.5 h-9 w-28 border-[#262626] bg-[#111] text-white"
                        />
                    </label>
                    <Button
                        onClick={enregistrer}
                        disabled={occupe}
                        data-testid="quota-enregistrer"
                        className="h-9 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]"
                    >
                        <Save size={14} className="mr-2" /> Enregistrer
                    </Button>
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-[#262626] bg-[#0a0a0a]">
                {donnees.admins.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-neutral-500">
                        Aucun compte n&apos;a le droit d&apos;ajouter du contenu.
                    </p>
                ) : donnees.admins.map((a) => (
                    <div key={a.user_id} className="border-b border-[#1a1a1a] px-5 py-4 last:border-b-0">
                        <div className="flex flex-wrap items-center gap-3">
                            {a.picture
                                ? <img src={a.picture} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                                : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8D2A6] text-xs font-semibold text-black">
                                    {a.name[0]?.toUpperCase() || "?"}
                                </div>}

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-sm text-white">
                                    {a.name}
                                    {a.atteint && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                                            <Check size={10} /> Fait
                                        </span>
                                    )}
                                </div>
                                <div className="mt-0.5 text-xs text-neutral-500">{a.role}</div>
                            </div>

                            <div className="shrink-0 text-right">
                                <div className={`font-display text-xl tabular-nums ${a.atteint ? "text-emerald-300" : "text-white"}`}>
                                    {a.aujourdhui}<span className="text-sm text-neutral-600"> / {donnees.cible}</span>
                                </div>
                                {!a.atteint && (
                                    <div className="text-xs text-amber-300">
                                        il en manque {a.manquants}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#161616]">
                            <div
                                className={`h-full rounded-full ${a.atteint ? "bg-emerald-400" : "bg-[#E8D2A6]"}`}
                                style={{ width: `${Math.min(100, (a.aujourdhui / donnees.cible) * 100)}%` }}
                            />
                        </div>

                        {a.titres.length > 0 && (
                            <div className="mt-2 truncate text-xs text-neutral-600" title={a.titres.join(", ")}>
                                {a.titres.join(" · ")}
                            </div>
                        )}

                        <div className="mt-3 flex items-end gap-1">
                            {a.historique.map((j) => {
                                const part = Math.min(1, j.total / donnees.cible);
                                return (
                                    <div key={j.date} className="flex-1 text-center" title={`${j.date} — ${j.total} contenu(s)`}>
                                        <div className="mx-auto flex h-10 w-full items-end">
                                            <div
                                                className={`w-full rounded-sm ${j.total >= donnees.cible ? "bg-emerald-400/70" : j.total > 0 ? "bg-[#E8D2A6]/60" : "bg-[#1a1a1a]"}`}
                                                style={{ height: `${Math.max(6, part * 100)}%` }}
                                            />
                                        </div>
                                        <div className="mt-1 text-[9px] text-neutral-600">{jourCourt(j.date)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
