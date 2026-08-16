import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trophy, Save, Plus, X, Star } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminCagnotteTiers() {
    const [paliers, setPaliers] = useState(null);
    const [occupe, setOccupe] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/admin/cagnotte/tiers");
                setPaliers(r.data.tiers || []);
            } catch (e) { showError(toast, e, "Chargement des paliers impossible"); }
        })();
    }, []);

    const modifier = (index, champ, valeur) =>
        setPaliers((liste) => liste.map((p, i) => (i === index ? { ...p, [champ]: valeur } : p)));

    const modifierRecompense = (index, rang, valeur) =>
        setPaliers((liste) => liste.map((p, i) => (i === index
            ? { ...p, rewards: p.rewards.map((r, j) => (j === rang ? valeur : r)) }
            : p)));

    const enregistrer = async () => {
        setOccupe(true);
        try {
            const r = await api.post("/admin/cagnotte/tiers", {
                tiers: paliers.map((p) => ({
                    amount: Number(p.amount) || 0,
                    label: p.label || "",
                    rewards: (p.rewards || []).map((x) => String(x).trim()).filter(Boolean),
                    highlight: !!p.highlight,
                })),
            });
            setPaliers(r.data.tiers || []);
            toast.success("Paliers mis à jour");
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
        finally { setOccupe(false); }
    };

    if (!paliers) return null;

    return (
        <div className="mb-8 rounded-xl border border-[#262626] bg-[#0a0a0a] p-5" data-testid="admin-tiers">
            <div className="flex items-start gap-3">
                <Trophy size={17} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                <div>
                    <div className="text-sm font-medium text-white">Paliers de récompenses</div>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-500">
                        Ce que débloque la cagnotte pour tout le monde une fois le montant atteint. L&apos;étoile
                        met un palier en avant. N&apos;annonce que ce que tu pourras réellement tenir.
                    </p>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {paliers.map((palier, index) => (
                    <div key={index} className="rounded-lg border border-[#1f1f1f] bg-[#111] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                type="number"
                                min={0}
                                value={palier.amount}
                                onChange={(e) => modifier(index, "amount", e.target.value)}
                                className="h-9 w-24 border-[#262626] bg-[#0a0a0a] text-white"
                            />
                            <span className="text-sm text-neutral-500">€</span>
                            <Input
                                value={palier.label}
                                onChange={(e) => modifier(index, "label", e.target.value)}
                                placeholder="Nom du palier"
                                maxLength={40}
                                className="h-9 min-w-[140px] flex-1 border-[#262626] bg-[#0a0a0a] text-white"
                            />
                            <button
                                type="button"
                                onClick={() => setPaliers((liste) => liste.map((p, i) => ({ ...p, highlight: i === index && !p.highlight })))}
                                title="Mettre ce palier en avant"
                                className={`shrink-0 rounded-full border p-2 transition-colors ${palier.highlight
                                    ? "border-[#E8D2A6] text-[#E8D2A6]"
                                    : "border-[#262626] text-neutral-600 hover:text-neutral-300"}`}
                            >
                                <Star size={14} fill={palier.highlight ? "currentColor" : "none"} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaliers((liste) => liste.filter((_, i) => i !== index))}
                                title="Retirer ce palier"
                                className="shrink-0 text-neutral-600 transition-colors hover:text-red-400"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="mt-3 space-y-1.5">
                            {(palier.rewards || []).map((recompense, rang) => (
                                <div key={rang} className="flex items-center gap-2">
                                    <Input
                                        value={recompense}
                                        onChange={(e) => modifierRecompense(index, rang, e.target.value)}
                                        placeholder="Ce que ça débloque"
                                        maxLength={80}
                                        className="h-9 border-[#262626] bg-[#0a0a0a] text-sm text-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => modifier(index, "rewards", palier.rewards.filter((_, j) => j !== rang))}
                                        className="shrink-0 text-neutral-600 transition-colors hover:text-red-400"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            {(palier.rewards || []).length < 5 && (
                                <button
                                    type="button"
                                    onClick={() => modifier(index, "rewards", [...(palier.rewards || []), ""])}
                                    className="text-xs text-[#E8D2A6] hover:underline"
                                >
                                    + Ajouter une contrepartie
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                {paliers.length < 6 && (
                    <Button
                        variant="outline"
                        onClick={() => setPaliers((liste) => [...liste, { amount: 0, label: "", rewards: [""], highlight: false }])}
                        className="rounded-full border-[#262626] bg-transparent text-white hover:bg-white/5"
                    >
                        <Plus size={14} className="mr-2" /> Ajouter un palier
                    </Button>
                )}
                <Button
                    onClick={enregistrer}
                    disabled={occupe}
                    data-testid="save-tiers"
                    className="rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]"
                >
                    <Save size={14} className="mr-2" /> Enregistrer
                </Button>
            </div>
        </div>
    );
}
