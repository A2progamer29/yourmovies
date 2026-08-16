import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Save } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function AdminSupportBanner() {
    const [config, setConfig] = useState(null);
    const [occupe, setOccupe] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get("/admin/support-banner");
                setConfig(r.data);
            } catch (e) { showError(toast, e, "Chargement du bandeau impossible"); }
        })();
    }, []);

    const enregistrer = async () => {
        setOccupe(true);
        try {
            const r = await api.post("/admin/support-banner", {
                enabled: !!config.enabled,
                always_show: !!config.always_show,
                message: config.message,
                cta_label: config.cta_label,
            });
            setConfig(r.data);
            toast.success("Bandeau mis à jour");
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
        finally { setOccupe(false); }
    };

    if (!config) return null;

    return (
        <div className="mb-8 rounded-xl border border-[#262626] bg-[#0a0a0a] p-5" data-testid="admin-support-banner">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Megaphone size={17} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                    <div>
                        <div className="text-sm font-medium text-white">Bandeau de soutien</div>
                        <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-500">
                            Une bande fine en haut de chaque page, avec un bouton vers la cagnotte. Un visiteur qui
                            la ferme ne la revoit pas avant sa prochaine visite.
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-xs text-neutral-400">{config.enabled ? "Affiché" : "Masqué"}</span>
                    <Switch
                        checked={!!config.enabled}
                        onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
                        data-testid="banner-enabled"
                    />
                </div>
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-lg border border-[#1f1f1f] bg-[#111] p-3.5">
                <Switch
                    checked={!!config.always_show}
                    onCheckedChange={(v) => setConfig((c) => ({ ...c, always_show: v }))}
                    data-testid="banner-always"
                    className="mt-0.5 shrink-0"
                />
                <span className="min-w-0">
                    <span className="block text-sm text-white">Réafficher à chaque rechargement</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                        La croix ferme toujours le bandeau, mais il revient au chargement suivant au lieu de
                        rester masqué jusqu&apos;à la prochaine visite. Plus insistant : à réserver aux périodes
                        où ça compte vraiment.
                    </span>
                </span>
            </label>

            <label className="mt-4 block">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500">Message</span>
                <Textarea
                    value={config.message || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, message: e.target.value }))}
                    maxLength={300}
                    rows={2}
                    data-testid="banner-message"
                    className="mt-1.5 border-[#262626] bg-[#111] text-sm text-white"
                />
            </label>

            <label className="mt-4 block max-w-xs">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500">Texte du bouton</span>
                <Input
                    value={config.cta_label || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, cta_label: e.target.value }))}
                    maxLength={40}
                    className="mt-1.5 border-[#262626] bg-[#111] text-white"
                />
            </label>

            <Button
                onClick={enregistrer}
                disabled={occupe}
                data-testid="save-banner"
                className="mt-5 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]"
            >
                <Save size={14} className="mr-2" /> Enregistrer
            </Button>
        </div>
    );
}
