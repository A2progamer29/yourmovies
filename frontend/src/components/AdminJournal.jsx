import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Plus, Trash2, Inbox, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

const ACTIONS = {
    added: { libelle: "a ajouté", icone: <Plus size={13} />, ton: "text-emerald-300 bg-emerald-400/10" },
    proposed: { libelle: "a proposé", icone: <Inbox size={13} />, ton: "text-[#E8D2A6] bg-[#E8D2A6]/10" },
    published: { libelle: "a validé", icone: <Check size={13} />, ton: "text-sky-300 bg-sky-400/10" },
    rejected: { libelle: "a refusé", icone: <X size={13} />, ton: "text-amber-300 bg-amber-400/10" },
    deleted: { libelle: "a supprimé", icone: <Trash2 size={13} />, ton: "text-red-300 bg-red-400/10" },
};

const FILTRES = [
    { valeur: "", libelle: "Tout" },
    { valeur: "added", libelle: "Ajouts" },
    { valeur: "proposed", libelle: "Propositions" },
    { valeur: "published", libelle: "Validations" },
    { valeur: "rejected", libelle: "Refus" },
    { valeur: "deleted", libelle: "Suppressions" },
];

/** Date et heure complètes : savoir « qui » sans « quand » ne règle aucun litige. */
function horodatage(valeur) {
    if (!valeur) return "—";
    const d = new Date(valeur);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("fr-FR", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function jour(valeur) {
    const d = new Date(valeur);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function AdminJournal() {
    const [items, setItems] = useState(null);
    const [filtre, setFiltre] = useState("");
    const [chargement, setChargement] = useState(false);

    const charger = useCallback(async (action) => {
        setChargement(true);
        try {
            const r = await api.get("/admin/journal", {
                params: action ? { action } : undefined,
                silent: true,
            });
            setItems(r.data.items || []);
        } catch (e) {
            setItems([]);
            showError(toast, e, "Journal indisponible");
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { charger(filtre); }, [charger, filtre]);

    if (items === null) {
        return (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" /> Lecture du journal…
            </div>
        );
    }

    let dernierJour = null;

    return (
        <div className="space-y-4" data-testid="admin-journal">
            <div className="flex flex-wrap items-center gap-2">
                {FILTRES.map((f) => (
                    <button
                        key={f.valeur || "tout"}
                        type="button"
                        onClick={() => setFiltre(f.valeur)}
                        data-testid={`journal-filtre-${f.valeur || "tout"}`}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${filtre === f.valeur
                            ? "bg-[#E8D2A6] text-black"
                            : "bg-[#161616] text-neutral-300 hover:bg-[#1f1f1f]"}`}
                    >
                        {f.libelle}
                    </button>
                ))}
                <Button
                    onClick={() => charger(filtre)}
                    disabled={chargement}
                    data-testid="journal-actualiser"
                    className="ml-auto h-8 rounded-full bg-[#161616] px-4 text-xs font-semibold text-neutral-300 hover:bg-[#1f1f1f]"
                >
                    {chargement
                        ? <Loader2 size={13} className="mr-2 animate-spin" />
                        : <RefreshCw size={13} className="mr-2" />}
                    Actualiser
                </Button>
            </div>

            {items.length === 0 ? (
                <p className="rounded-xl border border-[#262626] bg-[#0a0a0a] px-5 py-10 text-center text-sm text-neutral-500">
                    Rien à afficher pour ce filtre.
                </p>
            ) : (
                <div className="overflow-hidden rounded-xl border border-[#262626] bg-[#0a0a0a]">
                    {items.map((e) => {
                        const action = ACTIONS[e.action] || { libelle: e.action, icone: null, ton: "text-neutral-300 bg-white/5" };
                        const jourCourant = jour(e.at);
                        const nouveauJour = jourCourant && jourCourant !== dernierJour;
                        dernierJour = jourCourant;
                        return (
                            <React.Fragment key={e.id}>
                                {nouveauJour && (
                                    <div className="border-b border-[#1a1a1a] bg-[#0c0c0c] px-4 py-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
                                        {jourCourant}
                                    </div>
                                )}
                                <div className="flex items-center gap-3 border-b border-[#1a1a1a] px-4 py-3 last:border-b-0">
                                    {e.poster_url
                                        ? <img src={e.poster_url} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                                        : <div className="h-12 w-8 shrink-0 rounded bg-[#111]" />}

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                                            <span className="font-medium text-white">{e.user_name}</span>
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${action.ton}`}>
                                                {action.icone} {action.libelle}
                                            </span>
                                            <span className="min-w-0 truncate text-neutral-300">{e.title || "Sans titre"}</span>
                                        </div>
                                        <div className="mt-0.5 text-xs tabular-nums text-neutral-500">
                                            {horodatage(e.at)}
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
