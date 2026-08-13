import React, { useState } from "react";
import { toast } from "sonner";
import { Search, TriangleAlert, Check } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const MESSAGE_PAR_DEFAUT = "Le lecteur de ce contenu est momentanément indisponible. Nous travaillons à le rétablir.";

export default function AdminPlayers({ items, onUpdated }) {
    const [recherche, setRecherche] = useState("");
    const [seulementSignales, setSeulementSignales] = useState(false);
    const [brouillons, setBrouillons] = useState({});
    const [occupe, setOccupe] = useState(null);

    const enregistrer = async (media, changements) => {
        setOccupe(media.id);
        try {
            const r = await api.patch(`/admin/media/${media.id}/flags`, changements);
            onUpdated?.(media.id, r.data);
            toast.success(
                changements.player_broken === true ? "Contenu signalé aux visiteurs"
                    : changements.player_broken === false ? "Signalement retiré"
                        : "Message mis à jour"
            );
        } catch (e) {
            showError(toast, e, "Mise à jour impossible");
        } finally {
            setOccupe(null);
        }
    };

    const liste = items.filter((m) => {
        if (seulementSignales && !m.player_broken) return false;
        if (!recherche.trim()) return true;
        return m.title.toLowerCase().includes(recherche.trim().toLowerCase());
    });

    const signales = items.filter((m) => m.player_broken).length;

    return (
        <div className="space-y-5" data-testid="admin-players">
            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                <div className="flex items-start gap-3">
                    <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-400" />
                    <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
                        Signale un contenu dont la lecture ne fonctionne pas. Un bandeau s&apos;affiche alors sur sa
                        fiche et à la place du lecteur, pour que les visiteurs sachent que c&apos;est connu plutôt que
                        de croire à une panne de leur côté.
                    </p>
                </div>
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
                <button
                    type="button"
                    onClick={() => setSeulementSignales((v) => !v)}
                    data-testid="filter-broken"
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${seulementSignales
                        ? "border-amber-400 bg-amber-400 font-semibold text-black"
                        : signales > 0
                            ? "border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
                            : "border-[#262626] text-neutral-400 hover:border-[#E8D2A6]/50 hover:text-white"}`}
                >
                    Signalés <span className="tabular-nums opacity-70">{signales}</span>
                </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#262626] bg-[#0a0a0a]">
                {liste.length === 0 && (
                    <div className="px-5 py-10 text-center text-sm text-neutral-500">
                        {seulementSignales ? "Aucun contenu signalé." : "Aucun contenu."}
                    </div>
                )}
                {liste.map((media) => {
                    const brouillon = brouillons[media.id];
                    const message = brouillon !== undefined ? brouillon : (media.player_notice || "");
                    const modifie = brouillon !== undefined && brouillon !== (media.player_notice || "");
                    return (
                        <div key={media.id} className="border-b border-[#1a1a1a] px-4 py-3.5 last:border-b-0">
                            <div className="flex items-center gap-3">
                                {media.poster_url
                                    ? <img src={media.poster_url} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                                    : <div className="h-12 w-8 shrink-0 rounded bg-[#111]" />}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm text-white">{media.title}</div>
                                    <div className="mt-0.5 text-xs text-neutral-500">
                                        {media.type}{media.year ? ` · ${media.year}` : ""}
                                        {media.player_broken && <span className="ml-2 text-amber-300">lecteur signalé</span>}
                                    </div>
                                </div>
                                <Switch
                                    checked={!!media.player_broken}
                                    disabled={occupe === media.id}
                                    onCheckedChange={(v) => enregistrer(media, { player_broken: v })}
                                    aria-label={`Signaler le lecteur de ${media.title}`}
                                    data-testid={`broken-${media.id}`}
                                />
                            </div>

                            {media.player_broken && (
                                <div className="mt-3 flex flex-col gap-2 pl-11 sm:flex-row sm:items-center">
                                    <Input
                                        value={message}
                                        onChange={(e) => setBrouillons((b) => ({ ...b, [media.id]: e.target.value }))}
                                        placeholder={MESSAGE_PAR_DEFAUT}
                                        maxLength={300}
                                        className="border-[#262626] bg-[#111] text-sm text-white"
                                    />
                                    <Button
                                        onClick={() => enregistrer(media, { player_notice: message }).then(() =>
                                            setBrouillons((b) => { const c = { ...b }; delete c[media.id]; return c; })
                                        )}
                                        disabled={!modifie || occupe === media.id}
                                        className="h-10 shrink-0 rounded-full bg-[#E8D2A6] px-4 text-xs font-semibold text-black hover:bg-[#D4BB8B] disabled:bg-[#161616] disabled:text-neutral-600"
                                    >
                                        <Check size={13} className="mr-1.5" /> Enregistrer
                                    </Button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="text-xs leading-relaxed text-neutral-600">
                Sans message personnalisé, le bandeau affiche : « {MESSAGE_PAR_DEFAUT} »
            </p>
        </div>
    );
}
