import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Save } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function AdminReferral() {
    const [config, setConfig] = useState(null);
    const [occupe, setOccupe] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/admin/referral");
                setConfig(r.data);
            } catch (e) { showError(toast, e, "Chargement du parrainage impossible"); }
        })();
    }, []);

    const enregistrer = async () => {
        setOccupe(true);
        try {
            const r = await api.post("/admin/referral", {
                enabled: !!config.enabled,
                coins_parrain: Number(config.coins_parrain) || 0,
                coins_filleul: Number(config.coins_filleul) || 0,
            });
            setConfig(r.data);
            toast.success("Parrainage mis à jour");
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
        finally { setOccupe(false); }
    };

    if (!config) return null;

    return (
        <div className="mb-8 rounded-xl border border-[#262626] bg-[#0a0a0a] p-5" data-testid="admin-referral">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Gift size={17} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                    <div>
                        <div className="text-sm font-medium text-white">Parrainage</div>
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-500">
                            Chaque membre dispose d&apos;un lien personnel. À l&apos;inscription d&apos;un filleul,
                            les deux comptes sont crédités automatiquement.
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-xs text-neutral-400">{config.enabled ? "Actif" : "Désactivé"}</span>
                    <Switch
                        checked={!!config.enabled}
                        onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
                        data-testid="referral-enabled"
                    />
                </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[
                    { cle: "coins_parrain", label: "Freemium pour le parrain" },
                    { cle: "coins_filleul", label: "Freemium pour le filleul" },
                ].map((champ) => (
                    <label key={champ.cle} className="block">
                        <span className="text-[10px] uppercase tracking-widest text-neutral-500">{champ.label}</span>
                        <Input
                            type="number"
                            min={0}
                            max={1000}
                            value={config[champ.cle] ?? 0}
                            onChange={(e) => setConfig((c) => ({ ...c, [champ.cle]: e.target.value }))}
                            data-testid={`referral-${champ.cle}`}
                            className="mt-1.5 border-[#262626] bg-[#111] text-white"
                        />
                    </label>
                ))}
            </div>

            <Button
                onClick={enregistrer}
                disabled={occupe}
                data-testid="save-referral"
                className="mt-5 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]"
            >
                <Save size={14} className="mr-2" /> Enregistrer
            </Button>
        </div>
    );
}
