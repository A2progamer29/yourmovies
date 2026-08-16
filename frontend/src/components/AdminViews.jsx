import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2, RefreshCw, Search, Film, Tv } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function nombre(valeur) {
    return (Number(valeur) || 0).toLocaleString("fr-FR");
}

export default function AdminViews() {
    const [rapport, setRapport] = useState(null);
    const [chargement, setChargement] = useState(true);
    const [recherche, setRecherche] = useState("");

    const charger = useCallback(async (silencieux) => {
        if (!silencieux) setChargement(true);
        try {
            const r = await api.get("/admin/bunny/views");
            setRapport(r.data);
        } catch (e) {
            showError(toast, e, "Lecture des vues impossible");
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    if (chargement) {
        return (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400" data-testid="admin-views">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" />
                Lecture de la bibliothèque vidéo…
            </div>
        );
    }

    const items = (rapport?.items || []).filter(
        (item) => !recherche.trim() || item.title.toLowerCase().includes(recherche.trim().toLowerCase())
    );
    const maximum = rapport?.items?.[0]?.views || 1;

    return (
        <div className="space-y-5" data-testid="admin-views">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                    { label: "Vues totales", valeur: nombre(rapport?.total_views), or: true },
                    { label: "Contenus suivis", valeur: nombre(rapport?.items?.length) },
                    { label: "Vues hors catalogue", valeur: nombre(rapport?.unlinked_views) },
                ].map((c) => (
                    <div key={c.label} className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-4">
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500">{c.label}</div>
                        <div className={`mt-1.5 font-display text-2xl tabular-nums ${c.or ? "text-[#E8D2A6]" : "text-white"}`}>{c.valeur}</div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative sm:max-w-xs sm:flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <Input
                        value={recherche}
                        onChange={(e) => setRecherche(e.target.value)}
                        placeholder="Rechercher un titre…"
                        className="border-[#262626] bg-[#111] pl-9 text-white"
                    />
                </div>
                <Button
                    onClick={() => charger()}
                    data-testid="refresh-views"
                    variant="outline"
                    className="rounded-full border-[#262626] bg-transparent text-white hover:bg-white/5 sm:ml-auto"
                >
                    <RefreshCw size={14} className="mr-2" /> Actualiser
                </Button>
            </div>

            {items.length === 0 ? (
                <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-10 text-center text-sm text-neutral-400">
                    {recherche ? "Aucun titre ne correspond." : "Aucune vue enregistrée pour le moment."}
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-[#262626] bg-[#0a0a0a]">
                    {items.map((item, rang) => (
                        <div key={item.id} className="flex items-center gap-4 border-b border-[#1a1a1a] px-4 py-3 last:border-b-0">
                            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-600">{rang + 1}</span>
                            {item.poster_url
                                ? <img src={item.poster_url} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                                : <div className="h-12 w-8 shrink-0 rounded bg-[#111]" />}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    {item.type === "movie"
                                        ? <Film size={12} className="shrink-0 text-neutral-600" />
                                        : <Tv size={12} className="shrink-0 text-neutral-600" />}
                                    <span className="truncate text-sm text-white">{item.title}</span>
                                </div>
                                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#161616]">
                                    <div className="h-full rounded-full bg-[#E8D2A6]/60" style={{ width: `${Math.round((item.views / maximum) * 100)}%` }} />
                                </div>
                                <div className="mt-1 truncate text-[11px] text-neutral-600">
                                    {item.videos} vidéo{item.videos > 1 ? "s" : ""}
                                    {item.best ? ` · plus regardé : ${item.best.title} (${nombre(item.best.views)})` : ""}
                                </div>
                            </div>
                            <div className="shrink-0 text-right">
                                <div className="flex items-center justify-end gap-1.5 font-display text-xl tabular-nums text-white">
                                    <Eye size={13} className="text-neutral-600" /> {nombre(item.views)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs leading-relaxed text-neutral-600">
                Chiffres comptés par l'hébergeur vidéo, indépendamment du site : une vue correspond au démarrage
                d&apos;une vidéo. Pour une série, le total additionne tous ses épisodes.
            </p>
        </div>
    );
}
