import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trophy, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";

function quand(valeur) {
    if (!valeur) return "—";
    const d = new Date(valeur);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
}

export default function AdminContributors() {
    const [liste, setListe] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/admin/contributors");
                setListe(Array.isArray(r.data) ? r.data : []);
            } catch (e) { showError(toast, e, "Chargement des contributeurs impossible"); }
        })();
    }, []);

    if (liste.length === 0) {
        return (
            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-10 text-center text-sm text-neutral-400" data-testid="admin-contributors">
                Aucun ajout enregistré pour l&apos;instant.
            </div>
        );
    }

    const meilleur = liste[0]?.total || 1;

    return (
        <div className="space-y-2" data-testid="admin-contributors">
            {liste.map((personne, rang) => (
                <div key={personne.user_id || rang} className="flex items-center gap-4 rounded-xl border border-[#262626] bg-[#0a0a0a] p-4">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${rang === 0 ? "bg-[#E8D2A6] text-black" : "border border-[#262626] text-neutral-400"}`}>
                        {rang === 0 ? <Trophy size={14} /> : rang + 1}
                    </div>
                    {personne.avatar_url
                        ? <img src={personne.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        : <div className="h-9 w-9 shrink-0 rounded-full bg-[#161616]" />}
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-white">{personne.name}</div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#161616]">
                            <div className="h-full rounded-full bg-[#E8D2A6]/60" style={{ width: `${Math.round((personne.total / meilleur) * 100)}%` }} />
                        </div>
                        <div className="mt-1.5 truncate text-[11px] text-neutral-600">
                            {personne.derniers_titres?.filter(Boolean).slice(0, 3).join(" · ") || "—"}
                        </div>
                    </div>
                    <div className="shrink-0 text-right">
                        <div className="font-display text-xl text-white tabular-nums">{personne.total}</div>
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500">ajouts</div>
                        {personne.en_attente > 0 && (
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-amber-300">
                                <Clock size={9} /> {personne.en_attente} en attente
                            </div>
                        )}
                        <div className="mt-1 text-[10px] text-neutral-600">dernier : {quand(personne.dernier)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}
