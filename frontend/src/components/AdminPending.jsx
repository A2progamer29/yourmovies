import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, X, Edit, Inbox, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/perms";
import { Button } from "@/components/ui/button";

function complet(media) {
    const jouable = (item = {}) => Boolean(
        item.bunny_video_id || item.video_url || item.video_file_path
        || (Array.isArray(item.qualities) && item.qualities.some((q) => q?.url || q?.file_path))
    );
    if (media.type === "movie") return jouable(media);
    const episodes = (media.seasons || []).flatMap((s) => s?.episodes || []);
    return episodes.length > 0 && episodes.every(jouable);
}

export default function AdminPending({ onCount }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [propositions, setPropositions] = useState([]);
    const [occupe, setOccupe] = useState(null);

    const peutTrancher = can(user, "content.publish") || can(user, "content.delete");

    const charger = useCallback(async () => {
        try {
            const r = await api.get("/admin/pending");
            const liste = Array.isArray(r.data) ? r.data : [];
            setPropositions(liste);
            onCount?.(liste.length);
        } catch (e) { showError(toast, e, "Chargement des propositions impossible"); }
    }, [onCount]);

    useEffect(() => { charger(); }, [charger]);

    const publier = async (media) => {
        if (!complet(media) && !window.confirm(`« ${media.title} » n'a pas de vidéo jouable pour tous ses épisodes.\n\nLe publier quand même ?`)) return;
        setOccupe(media.id);
        try {
            await api.post(`/admin/pending/${media.id}/publish`);
            toast.success(`« ${media.title} » est en ligne`);
            await charger();
        } catch (e) { showError(toast, e, "Publication impossible"); }
        finally { setOccupe(null); }
    };

    const refuser = async (media) => {
        if (!window.confirm(`Refuser « ${media.title} » ?\n\nLa proposition est supprimée et ses vidéos sont retirées de l'hébergeur. Irréversible.`)) return;
        setOccupe(media.id);
        try {
            const r = await api.delete(`/admin/pending/${media.id}`);
            toast.success(`Proposition refusée${r.data?.bunny_deleted ? ` · ${r.data.bunny_deleted} vidéo(s) supprimée(s)` : ""}`);
            await charger();
        } catch (e) { showError(toast, e, "Refus impossible"); }
        finally { setOccupe(null); }
    };

    if (propositions.length === 0) {
        return (
            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-10 text-center" data-testid="admin-pending">
                <Inbox size={22} className="mx-auto mb-3 text-neutral-600" />
                <p className="text-sm text-neutral-400">Aucune proposition en attente.</p>
                <p className="mt-1 text-xs text-neutral-600">
                    Les contenus ajoutés par un compte sans droit de publication arrivent ici.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="admin-pending">
            {propositions.map((media) => {
                const pret = complet(media);
                return (
                    <div key={media.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-[#262626] bg-[#0a0a0a] p-4">
                        {media.poster_url
                            ? <img src={media.poster_url} alt="" className="h-[72px] w-12 shrink-0 rounded object-cover" />
                            : <div className="h-[72px] w-12 shrink-0 rounded bg-[#111]" />}
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-white">{media.title}</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${pret
                                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                    : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>
                                    {pret ? "Complet" : "Sans vidéo"}
                                </span>
                            </div>
                            <div className="mt-1 text-xs text-neutral-500">
                                {media.type} {media.year ? `· ${media.year}` : ""}
                                {media.proposed_by_name ? ` · proposé par ${media.proposed_by_name}` : ""}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/admin/media/${media.id}/edit`)}
                                title="Vérifier la fiche"
                                className="text-neutral-400 hover:bg-white/5 hover:text-[#E8D2A6]"
                            >
                                <Edit size={14} />
                            </Button>
                            {peutTrancher && (
                                <>
                                    <Button
                                        onClick={() => publier(media)}
                                        disabled={occupe === media.id}
                                        data-testid={`publish-${media.id}`}
                                        className="h-9 rounded-full bg-[#E8D2A6] px-4 text-xs font-semibold text-black hover:bg-[#D4BB8B]"
                                    >
                                        {occupe === media.id ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Check size={13} className="mr-1.5" />}
                                        Publier
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => refuser(media)}
                                        disabled={occupe === media.id}
                                        title="Refuser"
                                        className="text-neutral-400 hover:bg-white/5 hover:text-red-400"
                                    >
                                        <X size={15} />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
