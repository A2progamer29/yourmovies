import React, { useState } from "react";
import { Shield, ShieldCheck, Check, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROLES = [
    { id: "editor", name: "Éditeur", icon: <Pencil size={16} />, desc: "Ajoute du contenu, voit les utilisateurs, approuve le wishboard. Rien d'autre." },
    { id: "moderator", name: "Modérateur", icon: <Shield size={16} />, desc: "Éditeur + modifie le contenu, bloque des comptes, gère wishboard / Freemium / annonces / commentaires." },
    { id: "super", name: "Super-admin", icon: <ShieldCheck size={16} />, desc: "Accès total : suppression, Premium, tarifs, cagnotte, gestion des rôles." },
];

export default function AdminRoleDialog({ user, open, onOpenChange, onDone }) {
    const [busy, setBusy] = useState(false);
    if (!user) return null;
    const locked = user.superadmin_locked;
    const current = user.admin_role;

    const setRole = async (role) => {
        setBusy(true);
        try {
            await api.post(`/admin/users/${user.user_id}/role`, { role });
            toast.success(role === "none" ? "Accès admin retiré" : "Rôle mis à jour");
            onOpenChange(false);
            onDone?.();
        } catch (e) { showError(toast, e, "Action impossible"); }
        finally { setBusy(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl flex items-center gap-2">
                        <Shield size={18} className="text-[#E8D2A6]" /> Rôle admin
                    </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-neutral-400 -mt-1">
                    Pour <span className="text-white">{user.name}</span>
                </p>

                {locked ? (
                    <div className="mt-3 p-4 rounded-xl border border-[#E8D2A6]/30 bg-[#171208] flex items-center gap-3">
                        <Lock size={18} className="text-[#E8D2A6] shrink-0" />
                        <div className="text-sm text-neutral-300">Ce compte est <span className="text-[#E8D2A6]">Super-admin protégé</span> (whitelist) et ne peut pas être modifié.</div>
                    </div>
                ) : (
                    <>
                        <div className="mt-3 space-y-2">
                            {ROLES.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => setRole(r.id)}
                                    disabled={busy}
                                    data-testid={`role-${r.id}`}
                                    className={`w-full text-left p-4 rounded-xl border transition-colors ${current === r.id ? "border-[#E8D2A6] bg-[#E8D2A6]/10" : "border-[#262626] bg-[#0a0a0a] hover:border-[#E8D2A6]/50"}`}
                                >
                                    <div className="flex items-center gap-2 text-white font-medium">
                                        <span className="text-[#E8D2A6]">{r.icon}</span> {r.name}
                                        {current === r.id && <Check size={14} className="text-[#E8D2A6] ml-auto" />}
                                    </div>
                                    <div className="text-xs text-neutral-400 mt-1 leading-relaxed">{r.desc}</div>
                                </button>
                            ))}
                        </div>
                        {current && (
                            <button onClick={() => setRole("none")} disabled={busy} className="mt-3 text-sm text-red-400 hover:text-red-300">
                                Retirer l&apos;accès admin
                            </button>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
