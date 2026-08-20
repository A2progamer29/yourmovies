import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Radio, Users, Eye, Clock, ListVideo } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

function duree(secondes) {
    const total = Math.max(0, Math.round(secondes || 0));
    const heures = Math.floor(total / 3600);
    if (heures >= 24) return `${Math.floor(heures / 24)} j ${heures % 24} h`;
    if (heures) return `${heures} h ${Math.floor((total % 3600) / 60)} min`;
    return `${Math.floor(total / 60)} min`;
}

function Bloc({ titre, icone, enfants }) {
    return (
        <section className="rounded-xl border border-[#262626] bg-[#0a0a0a]">
            <div className="flex items-center gap-2.5 border-b border-[#1a1a1a] px-5 py-3.5">
                {icone}
                <h3 className="text-sm font-medium text-white">{titre}</h3>
            </div>
            <div className="p-5">{enfants}</div>
        </section>
    );
}

function Chiffre({ legende, valeur, detail, ton }) {
    const couleur = ton === "vif" ? "text-[#E8D2A6]" : ton === "bien" ? "text-emerald-300" : "text-white";
    return (
        <div className="rounded-lg border border-[#262626] bg-[#0c0c0c] p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">{legende}</div>
            <div className={`mt-1.5 font-display text-2xl tabular-nums ${couleur}`}>{valeur}</div>
            {detail && <div className="mt-1 text-xs text-neutral-500">{detail}</div>}
        </div>
    );
}

export default function AdminStatistiques() {
    const [donnees, setDonnees] = useState(null);
    const [occupe, setOccupe] = useState(false);

    const charger = useCallback(async (silencieux) => {
        if (!silencieux) setOccupe(true);
        try {
            const r = await api.get("/admin/statistiques", { silent: true });
            setDonnees(r.data);
        } catch (e) {
            showError(toast, e, "Statistiques indisponibles");
        } finally {
            setOccupe(false);
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    // Le direct n'a d'intérêt que s'il est frais : on rafraîchit sans bruit, au
    // rythme de la fenêtre d'activité du lecteur.
    useEffect(() => {
        const minuteur = window.setInterval(() => charger(true), 45000);
        return () => window.clearInterval(minuteur);
    }, [charger]);

    if (!donnees) {
        return (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" /> Calcul des statistiques…
            </div>
        );
    }

    const { direct, membres, audience, catalogue, engagement } = donnees;

    return (
        <div className="space-y-5" data-testid="admin-statistiques">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="relative flex h-2 w-2">
                        <span className={`absolute inline-flex h-full w-full rounded-full ${direct.watching > 0 ? "animate-ping bg-emerald-400/60" : ""}`} />
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${direct.watching > 0 ? "bg-emerald-400" : "bg-neutral-700"}`} />
                    </span>
                    Actualisé automatiquement toutes les 45 secondes
                </div>
                <Button
                    onClick={() => charger()}
                    disabled={occupe}
                    data-testid="stats-actualiser"
                    className="h-8 rounded-full bg-[#161616] px-4 text-xs font-semibold text-neutral-300 hover:bg-[#1f1f1f]"
                >
                    {occupe ? <Loader2 size={13} className="mr-2 animate-spin" /> : <RefreshCw size={13} className="mr-2" />}
                    Actualiser
                </Button>
            </div>

            <Bloc
                titre="En direct"
                icone={<Radio size={16} className="text-[#E8D2A6]" />}
                enfants={
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <Chiffre
                                legende="En train de regarder"
                                valeur={direct.watching}
                                ton={direct.watching > 0 ? "bien" : undefined}
                            />
                            <Chiffre legende="Connectés" valeur={direct.online} detail="présents sur le site" />
                        </div>

                        {direct.viewers.length > 0 ? (
                            <div className="mt-4 overflow-hidden rounded-lg border border-[#262626]">
                                {direct.viewers.map((v, i) => (
                                    <div key={`${v.name}-${i}`} className="flex items-center gap-3 border-b border-[#1a1a1a] px-4 py-2.5 last:border-b-0">
                                        {v.poster_url
                                            ? <img src={v.poster_url} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                                            : <div className="h-10 w-7 shrink-0 rounded bg-[#111]" />}
                                        <span className="shrink-0 text-sm text-white">{v.name}</span>
                                        <span className="min-w-0 flex-1 truncate text-sm text-neutral-400">
                                            {v.title}
                                            {v.season_number ? ` · S${v.season_number}E${v.episode_number}` : ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-4 text-sm text-neutral-500">Personne ne regarde en ce moment.</p>
                        )}
                    </>
                }
            />

            <Bloc
                titre="Membres"
                icone={<Users size={16} className="text-[#E8D2A6]" />}
                enfants={
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Chiffre legende="Total" valeur={membres.total} />
                        <Chiffre legende="Abonnés" valeur={membres.abonnes} ton="vif" />
                        <Chiffre legende="Nouveaux · 7 j" valeur={membres.nouveaux_7j} />
                        <Chiffre legende="Nouveaux · 30 j" valeur={membres.nouveaux_30j} />
                    </div>
                }
            />

            <Bloc
                titre="Audience"
                icone={<Eye size={16} className="text-[#E8D2A6]" />}
                enfants={
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Chiffre legende="Visiteurs du jour" valeur={audience.visiteurs_jour} detail={`${audience.vues_jour} pages vues`} />
                        <Chiffre legende="Visiteurs · 7 jours" valeur={audience.visiteurs_7j} detail={`${audience.vues_7j} pages vues`} />
                        <Chiffre legende="Visiteurs · 30 jours" valeur={audience.visiteurs_30j} detail={`${audience.vues_30j} pages vues`} />
                    </div>
                }
            />

            <Bloc
                titre="Catalogue"
                icone={<ListVideo size={16} className="text-[#E8D2A6]" />}
                enfants={
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <Chiffre legende="Contenus" valeur={catalogue.total} />
                        <Chiffre legende="Films" valeur={catalogue.films} />
                        <Chiffre legende="Séries" valeur={catalogue.series} />
                        <Chiffre legende="Animes" valeur={catalogue.animes} />
                        <Chiffre legende="Épisodes" valeur={catalogue.episodes} />
                    </div>
                }
            />

            <Bloc
                titre="Engagement"
                icone={<Clock size={16} className="text-[#E8D2A6]" />}
                enfants={
                    <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Chiffre
                                legende="Temps regardé"
                                valeur={duree(engagement.secondes_regardees)}
                                detail="depuis la mise en place du comptage"
                            />
                            <Chiffre legende="Titres commencés" valeur={engagement.titres_commences} />
                            <Chiffre legende="Commentaires" valeur={engagement.commentaires} />
                            <Chiffre legende="Demandes Wishboard" valeur={engagement.souhaits} />
                        </div>

                        {engagement.top.length > 0 && (
                            <>
                                <div className="mt-5 text-[10px] uppercase tracking-widest text-neutral-500">Les plus regardés</div>
                                <div className="mt-2 overflow-hidden rounded-lg border border-[#262626]">
                                    {engagement.top.map((t, i) => (
                                        <div key={t.media_id} className="flex items-center gap-3 border-b border-[#1a1a1a] px-4 py-2.5 last:border-b-0">
                                            <span className="w-4 shrink-0 text-xs tabular-nums text-neutral-600">{i + 1}</span>
                                            {t.poster_url
                                                ? <img src={t.poster_url} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                                                : <div className="h-10 w-7 shrink-0 rounded bg-[#111]" />}
                                            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{t.title}</span>
                                            <span className="shrink-0 text-xs tabular-nums text-[#E8D2A6]">{duree(t.secondes)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                }
            />
        </div>
    );
}
