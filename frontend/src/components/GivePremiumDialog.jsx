import React, { useState } from "react";
import { Crown, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PLANS = [
    { id: "basic", name: "Basic" },
    { id: "standard", name: "Standard" },
    { id: "premium", name: "Premium" },
];
const DURATIONS = [
    { label: "30 jours", days: 30 },
    { label: "90 jours", days: 90 },
    { label: "1 an", days: 365 },
    { label: "À vie", days: 3650 },
];

export default function GivePremiumDialog({ user, open, onOpenChange, onDone }) {
    const [plan, setPlan] = useState("premium");
    const [days, setDays] = useState(3650);
    const [busy, setBusy] = useState(false);

    const give = async () => {
        setBusy(true);
        try {
            await api.post(`/admin/users/${user.user_id}/premium`, { plan, days });
            toast.success(`Premium ${plan} attribué à ${user.name}`);
            onOpenChange(false);
            onDone?.();
        } catch (e) { showError(toast, e, "Attribution impossible"); }
        finally { setBusy(false); }
    };

    const remove = async () => {
        setBusy(true);
        try {
            await api.post(`/admin/users/${user.user_id}/premium`, { remove: true });
            toast.success("Premium retiré");
            onOpenChange(false);
            onDone?.();
        } catch (e) { showError(toast, e, "Action impossible"); }
        finally { setBusy(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl flex items-center gap-2">
                        <Crown size={18} className="text-[#E8D2A6]" /> Attribuer un Premium
                    </DialogTitle>
                </DialogHeader>
                {user && (
                    <p className="text-sm text-neutral-400 -mt-1">
                        À <span className="text-white">{user.name}</span>
                        {user.premium && <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#E8D2A6] text-black font-bold">Déjà premium</span>}
                    </p>
                )}

                <div className="mt-3">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Plan</div>
                    <div className="grid grid-cols-3 gap-2">
                        {PLANS.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setPlan(p.id)}
                                data-testid={`premium-plan-${p.id}`}
                                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${plan === p.id ? "border-[#E8D2A6] bg-[#E8D2A6]/10 text-[#E8D2A6]" : "border-[#262626] text-neutral-300 hover:border-white/40"}`}
                            >
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Durée</div>
                    <div className="grid grid-cols-4 gap-2">
                        {DURATIONS.map((d) => (
                            <button
                                key={d.days}
                                onClick={() => setDays(d.days)}
                                className={`py-2 rounded-lg border text-xs font-medium transition-colors ${days === d.days ? "border-[#E8D2A6] bg-[#E8D2A6]/10 text-[#E8D2A6]" : "border-[#262626] text-neutral-300 hover:border-white/40"}`}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-6">
                    {user?.premium ? (
                        <button onClick={remove} disabled={busy} className="text-sm text-red-400 hover:text-red-300">Retirer le Premium</button>
                    ) : <span />}
                    <Button onClick={give} disabled={busy} data-testid="premium-give-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">
                        <Check size={14} className="mr-2" /> Attribuer
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
