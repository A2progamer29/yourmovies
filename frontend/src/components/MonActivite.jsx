import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { History, Star, MessageSquare, Loader2, Film, Tv, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";

function quand(valeur) {
    if (!valeur) return "";
    const d = new Date(valeur);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const GENRES = { movie: "Film", series: "Série", anime: "Anime" };

function IconeGenre({ type }) {
    if (type === "series") return <Tv size={12} className="shrink-0 text-neutral-600" />;
    if (type === "anime") return <Sparkles size={12} className="shrink-0 text-neutral-600" />;
    return <Film size={12} className="shrink-0 text-neutral-600" />;
}

function Bloc({ titre, icone, compte, enfants, vide }) {
    return (
        <section className="rounded-lg border border-[#262626] bg-[#0a0a0a]">
            <div className="flex items-center gap-2.5 border-b border-[#1a1a1a] px-4 py-3.5">
                {icone}
                <h3 className="text-sm font-medium text-white">{titre}</h3>
                {compte > 0 && (
                    <span className="rounded-full bg-[#E8D2A6]/10 px-2 py-0.5 text-[10px] font-semibold text-[#E8D2A6]">
                        {compte}
                    </span>
                )}
            </div>
            {compte === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-neutral-500">{vide}</p>
            ) : enfants}
        </section>
    );
}

export default function MonActivite() {
    const navigate = useNavigate();
    const [donnees, setDonnees] = useState(null);

    const charger = useCallback(async () => {
        try {
            const [h, w, c] = await Promise.all([
                api.get("/me/history", { silent: true }),
                api.get("/me/wishes", { silent: true }),
                api.get("/me/comments", { silent: true }),
            ]);
            setDonnees({
                historique: h.data.items || [],
                demandes: w.data.items || [],
                commentaires: c.data.items || [],
            });
        } catch (e) {
            setDonnees({ historique: [], demandes: [], commentaires: [] });
            showError(toast, e, "Chargement de l'activité impossible");
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    if (!donnees) {
        return (
            <div className="flex items-center gap-2.5 rounded-lg border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" /> Lecture de ton activité…
            </div>
        );
    }

    return (
        <div className="space-y-5" data-testid="mon-activite">
            <Bloc
                titre="Historique"
                icone={<History size={16} className="text-[#E8D2A6]" />}
                compte={donnees.historique.length}
                vide="Tu n'as encore rien regardé."
                enfants={
                    <div>
                        {donnees.historique.map((item) => (
                            <button
                                key={item.media_id}
                                type="button"
                                onClick={() => navigate(`/media/${item.media_id}`)}
                                className="flex w-full items-center gap-3 border-b border-[#1a1a1a] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.03]"
                            >
                                {item.poster_url
                                    ? <img src={item.poster_url} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                                    : <div className="h-14 w-10 shrink-0 rounded bg-[#111]" />}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm text-white">{item.title}</div>
                                    <div className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                                        <IconeGenre type={item.type} />
                                        {GENRES[item.type] || "Film"}
                                        {item.season_number ? ` · S${item.season_number}E${item.episode_number}` : ""}
                                        {item.episodes_count > 1 ? ` · ${item.episodes_count} épisodes` : ""}
                                    </div>
                                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#161616]">
                                        <div className="h-full rounded-full bg-[#E8D2A6]/60" style={{ width: `${item.progress_pct}%` }} />
                                    </div>
                                </div>
                                <span className="shrink-0 text-[11px] text-neutral-600">{quand(item.updated_at)}</span>
                            </button>
                        ))}
                    </div>
                }
            />

            <Bloc
                titre="Mes demandes"
                icone={<Star size={16} className="text-[#E8D2A6]" />}
                compte={donnees.demandes.length}
                vide="Tu n'as encore rien demandé sur le Wishboard."
                enfants={
                    <div>
                        {donnees.demandes.map((d) => (
                            <div key={d.id} className="flex items-center gap-3 border-b border-[#1a1a1a] px-4 py-3 last:border-b-0">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm text-white">{d.title}</div>
                                    <div className="mt-0.5 text-xs text-neutral-500">
                                        {d.votes} vote{d.votes > 1 ? "s" : ""} · demandé le {quand(d.created_at)}
                                    </div>
                                </div>
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${d.status === "approved"
                                    ? "bg-emerald-400/10 text-emerald-300"
                                    : d.status === "rejected"
                                        ? "bg-red-400/10 text-red-300"
                                        : "bg-neutral-500/10 text-neutral-400"}`}
                                >
                                    {d.status === "approved" ? "Ajouté" : d.status === "rejected" ? "Refusé" : "En attente"}
                                </span>
                            </div>
                        ))}
                    </div>
                }
            />

            <Bloc
                titre="Mes commentaires"
                icone={<MessageSquare size={16} className="text-[#E8D2A6]" />}
                compte={donnees.commentaires.length}
                vide="Tu n'as encore laissé aucun commentaire."
                enfants={
                    <div>
                        {donnees.commentaires.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => c.media_id && navigate(`/media/${c.media_id}`)}
                                className="flex w-full items-start gap-3 border-b border-[#1a1a1a] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.03]"
                            >
                                {c.media_poster
                                    ? <img src={c.media_poster} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                                    : <div className="h-12 w-8 shrink-0 rounded bg-[#111]" />}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs text-neutral-500">{c.media_title}</div>
                                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-neutral-300">{c.content || c.text}</p>
                                    <div className="mt-1 text-[11px] text-neutral-600">{quand(c.created_at)}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                }
            />
        </div>
    );
}
