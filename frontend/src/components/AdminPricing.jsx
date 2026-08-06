import React, { useEffect, useState } from "react";
import { Crown, Coins, Gift, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PLAN_IDS = ["basic", "standard", "premium"];
const PLAN_NAMES = { basic: "Basic", standard: "Standard", premium: "Premium" };

export default function AdminPricing() {
    const [premium, setPremium] = useState({});
    const [coins, setCoins] = useState({});
    const [welcome, setWelcome] = useState({ pct: 50, hours: 24, enabled: true });
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = async () => {
        try {
            const r = await api.get("/admin/pricing");
            const prem = {};
            (r.data.premium || []).forEach((p) => {
                prem[p.id] = { monthly: p.prices.monthly.amount, yearly: p.prices.yearly.amount };
            });
            setPremium(prem);
            const co = {};
            Object.entries(r.data.coins || {}).forEach(([k, v]) => { co[k] = v.options; });
            setCoins(co);
            setWelcome(r.data.welcome || { pct: 50, hours: 24, enabled: true });
            setLoaded(true);
        } catch (e) { showError(toast, e, "Chargement des tarifs impossible"); }
    };
    useEffect(() => { load(); }, []);

    const setPremiumVal = (pid, interval, val) => setPremium((m) => ({ ...m, [pid]: { ...m[pid], [interval]: val } }));
    const setCoinVal = (pid, idx, field, val) => setCoins((m) => ({ ...m, [pid]: m[pid].map((o, i) => (i === idx ? { ...o, [field]: val } : o)) }));

    const save = async () => {
        setBusy(true);
        try {
            const premiumPayload = {};
            PLAN_IDS.forEach((pid) => {
                if (premium[pid]) premiumPayload[pid] = { monthly: Number(premium[pid].monthly), yearly: Number(premium[pid].yearly) };
            });
            const coinsPayload = {};
            Object.entries(coins).forEach(([pid, opts]) => {
                coinsPayload[pid] = opts.map((o) => ({ days: Number(o.days), coins: Number(o.coins) }));
            });
            await api.post("/admin/pricing", {
                premium: premiumPayload,
                coins: coinsPayload,
                welcome: { pct: Number(welcome.pct), hours: Number(welcome.hours), enabled: !!welcome.enabled },
            });
            toast.success("Tarifs enregistrés");
            load();
        } catch (e) { showError(toast, e, "Enregistrement impossible"); }
        finally { setBusy(false); }
    };

    if (!loaded) return <div className="text-neutral-500 text-sm">Chargement…</div>;

    return (
        <div className="space-y-8 max-w-4xl">
            <section className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><Crown size={18} className="text-[#E8D2A6]" /><h3 className="font-display text-xl">Prix des abonnements Premium (€)</h3></div>
                <p className="text-xs text-neutral-500 mb-5">Prix affichés sur la page Premium et repris dans le ticket Discord.</p>
                <div className="space-y-4">
                    {PLAN_IDS.map((pid) => (
                        <div key={pid} className="grid grid-cols-3 gap-3 items-end">
                            <div className="text-sm text-white pb-2">{PLAN_NAMES[pid]}</div>
                            <label className="text-xs text-neutral-400">Mensuel
                                <Input type="number" step="0.01" value={premium[pid]?.monthly ?? ""} onChange={(e) => setPremiumVal(pid, "monthly", e.target.value)} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                            </label>
                            <label className="text-xs text-neutral-400">Annuel
                                <Input type="number" step="0.01" value={premium[pid]?.yearly ?? ""} onChange={(e) => setPremiumVal(pid, "yearly", e.target.value)} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                            </label>
                        </div>
                    ))}
                </div>
            </section>

            <section className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><Coins size={18} className="text-[#E8D2A6]" /><h3 className="font-display text-xl">Coûts en Freemium</h3></div>
                <p className="text-xs text-neutral-500 mb-5">Nombre de Freemium pour échanger chaque durée de Premium.</p>
                <div className="space-y-5">
                    {PLAN_IDS.map((pid) => (
                        <div key={pid}>
                            <div className="text-sm text-white mb-2">{PLAN_NAMES[pid]}</div>
                            <div className="flex flex-wrap gap-3">
                                {(coins[pid] || []).map((o, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-[#262626]">
                                        <Input type="number" value={o.days} onChange={(e) => setCoinVal(pid, idx, "days", e.target.value)} className="w-16 bg-[#111] border-[#262626] text-white h-9" />
                                        <span className="text-xs text-neutral-500">j =</span>
                                        <Input type="number" value={o.coins} onChange={(e) => setCoinVal(pid, idx, "coins", e.target.value)} className="w-24 bg-[#111] border-[#262626] text-white h-9" />
                                        <span className="text-xs text-[#E8D2A6]">Free</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><Gift size={18} className="text-[#E8D2A6]" /><h3 className="font-display text-xl">Offre de bienvenue</h3></div>
                <p className="text-xs text-neutral-500 mb-5">Réduction appliquée aux nouveaux inscrits (Premium affiché + Freemium).</p>
                <div className="flex flex-wrap items-end gap-4">
                    <label className="text-xs text-neutral-400">Réduction (%)
                        <Input type="number" value={welcome.pct} onChange={(e) => setWelcome((w) => ({ ...w, pct: e.target.value }))} className="mt-1 w-24 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">Durée (heures)
                        <Input type="number" value={welcome.hours} onChange={(e) => setWelcome((w) => ({ ...w, hours: e.target.value }))} className="mt-1 w-24 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer pb-2">
                        <input type="checkbox" checked={!!welcome.enabled} onChange={(e) => setWelcome((w) => ({ ...w, enabled: e.target.checked }))} className="accent-[#E8D2A6] w-4 h-4" />
                        Activée
                    </label>
                </div>
            </section>

            <Button onClick={save} disabled={busy} data-testid="save-pricing" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                <Save size={16} className="mr-2" /> {busy ? "Enregistrement…" : "Enregistrer les tarifs"}
            </Button>
        </div>
    );
}
