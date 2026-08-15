import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Monitor, Smartphone, Tablet, Trash2, Loader2, Info } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

function quand(valeur) {
    if (!valeur) return "";
    const d = new Date(valeur);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Icone({ forme }) {
    if (forme === "Téléphone") return <Smartphone size={18} className="text-[#E8D2A6]" />;
    if (forme === "Tablette") return <Tablet size={18} className="text-[#E8D2A6]" />;
    return <Monitor size={18} className="text-[#E8D2A6]" />;
}

export default function MesAppareils() {
    const [items, setItems] = useState(null);

    const charger = useCallback(async () => {
        try {
            const r = await api.get("/me/devices", { silent: true });
            setItems(r.data.items || []);
        } catch (e) {
            setItems([]);
            showError(toast, e, "Chargement des appareils impossible");
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const oublier = async (appareil) => {
        if (!window.confirm("Retirer cet appareil de la liste ?")) return;
        try {
            await api.delete(`/me/devices/${appareil.id}`);
            setItems((liste) => liste.filter((x) => x.id !== appareil.id));
            toast.success("Appareil retiré");
        } catch (e) { showError(toast, e, "Suppression impossible"); }
    };

    if (items === null) {
        return (
            <div className="flex items-center gap-2.5 rounded-lg border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" /> Lecture des appareils…
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="mes-appareils">
            {items.length === 0 ? (
                <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-10 text-center">
                    <Monitor size={20} className="mx-auto mb-3 text-neutral-600" />
                    <p className="text-sm text-neutral-400">Aucun appareil enregistré pour l&apos;instant.</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-[#262626] bg-[#0a0a0a]">
                    {items.map((a) => (
                        <div key={a.id} className="flex items-center gap-4 border-b border-[#1a1a1a] px-4 py-3.5 last:border-b-0">
                            <Icone forme={a.forme} />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-white">{a.systeme} · {a.navigateur}</div>
                                <div className="mt-0.5 text-xs text-neutral-500">
                                    {a.forme} · vu le {quand(a.last_seen)}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => oublier(a)}
                                title="Retirer de la liste"
                                className="shrink-0 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                            >
                                <Trash2 size={15} />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-3 rounded-lg border border-[#262626] bg-[#0a0a0a] p-4 text-sm text-neutral-400">
                <Info size={16} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                <p className="leading-relaxed">
                    Cette liste retrace les appareils depuis lesquels tu t&apos;es connecté. Elle
                    n&apos;enregistre ni ton adresse IP ni ta position — seulement le système et le
                    navigateur. Retirer un appareil l&apos;efface de la liste, mais ne déconnecte pas
                    la session : pour ça, change ton mot de passe.
                </p>
            </div>
        </div>
    );
}
