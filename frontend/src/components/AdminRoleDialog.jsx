import React, { useEffect, useState } from "react";
import { Shield, Lock, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PERM_GROUPS, ROLE_PRESETS, PRESET_LABELS } from "@/lib/perms";

export default function AdminRoleDialog({ user, open, onOpenChange, onDone }) {
    const [selected, setSelected] = useState([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open && user) setSelected(Array.isArray(user.admin_perms) ? [...user.admin_perms] : []);
    }, [open, user]);

    if (!user) return null;
    const locked = user.superadmin_locked;

    const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    const applyPreset = (key) => setSelected([...ROLE_PRESETS[key]]);

    const save = async () => {
        setBusy(true);
        try {
            await api.post(`/admin/users/${user.user_id}/role`, { perms: selected });
            toast.success(selected.length ? "Permissions mises à jour" : "Accès admin retiré");
            onOpenChange(false);
            onDone?.();
        } catch (e) { showError(toast, e, "Action impossible"); }
        finally { setBusy(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl flex items-center gap-2">
                        <Shield size={18} className="text-[#E8D2A6]" /> Permissions
                    </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-neutral-400 -mt-1">
                    Pour <span className="text-white">{user.name}</span>
                </p>

                {locked ? (
                    <div className="mt-3 p-4 rounded-xl border border-[#E8D2A6]/30 bg-[#171208] flex items-center gap-3">
                        <Lock size={18} className="text-[#E8D2A6] shrink-0" />
                        <div className="text-sm text-neutral-300">
                            Ce compte est <span className="text-[#E8D2A6]">super-admin protégé</span> : il possède toutes les permissions et ne peut pas être modifié.
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] uppercase tracking-widest text-neutral-500">Préréglages</span>
                            {Object.keys(ROLE_PRESETS).map((key) => (
                                <button
                                    key={key}
                                    onClick={() => applyPreset(key)}
                                    data-testid={`preset-${key}`}
                                    className="px-3 py-1.5 rounded-full border border-[#262626] text-xs text-neutral-300 hover:border-[#E8D2A6] hover:text-[#E8D2A6] transition-colors"
                                >
                                    {PRESET_LABELS[key]}
                                </button>
                            ))}
                            <button
                                onClick={() => setSelected([])}
                                className="px-3 py-1.5 rounded-full border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                Tout décocher
                            </button>
                        </div>

                        <div className="mt-2 space-y-4">
                            {PERM_GROUPS.map((g) => (
                                <div key={g.group}>
                                    <div className="text-[10px] uppercase tracking-widest text-[#E8D2A6] mb-1.5">{g.group}</div>
                                    <div className="rounded-xl border border-[#1a1a1a] bg-[#111] divide-y divide-[#1a1a1a]">
                                        {g.perms.map((p) => {
                                            const on = selected.includes(p.id);
                                            return (
                                                <label key={p.id} className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02]">
                                                    <input
                                                        type="checkbox"
                                                        checked={on}
                                                        onChange={() => toggle(p.id)}
                                                        data-testid={`perm-${p.id}`}
                                                        className="accent-[#E8D2A6] w-4 h-4 mt-0.5 shrink-0"
                                                    />
                                                    <span className="min-w-0">
                                                        <span className={`block text-sm ${on ? "text-white" : "text-neutral-300"}`}>{p.label}</span>
                                                        {p.hint && <span className="block text-[11px] text-neutral-500 leading-snug mt-0.5">{p.hint}</span>}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                            <span className="text-xs text-neutral-500">
                                {selected.length === 0
                                    ? "Aucune permission — l'accès admin sera retiré."
                                    : `${selected.length} permission${selected.length > 1 ? "s" : ""} sélectionnée${selected.length > 1 ? "s" : ""}.`}
                            </span>
                            <Button onClick={save} disabled={busy} data-testid="save-perms" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold shrink-0">
                                {selected.length ? <><Save size={14} className="mr-2" /> Enregistrer</> : <><Check size={14} className="mr-2" /> Retirer l'accès</>}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
