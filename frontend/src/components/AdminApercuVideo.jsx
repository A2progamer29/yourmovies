import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, X, CircleAlert, CircleCheck, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Les états renvoyés par l'hébergeur. Seul le dernier garantit une lecture
 *  possible : un fichier encore en traitement s'ouvre sur un écran noir, ce que
 *  la vérification doit dire au lieu de le laisser croire à une panne. */
const ETATS = {
    0: { texte: "En file d'attente", ton: "attente" },
    1: { texte: "Téléversement en cours", ton: "attente" },
    2: { texte: "Traitement en cours", ton: "attente" },
    3: { texte: "Encodage en cours", ton: "attente" },
    4: { texte: "Prête", ton: "pret" },
    5: { texte: "Échec du traitement", ton: "probleme" },
    6: { texte: "Bloquée par l'hébergeur", ton: "probleme" },
};

function Etat({ statut, progression }) {
    const etat = ETATS[statut] || { texte: "État inconnu", ton: "probleme" };
    const styles = {
        pret: "text-emerald-300",
        attente: "text-[#E8D2A6]",
        probleme: "text-red-300",
    }[etat.ton];
    const Icone = etat.ton === "pret" ? CircleCheck : etat.ton === "attente" ? Clock : CircleAlert;
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs ${styles}`}>
            <Icone size={12} />
            {etat.texte}
            {etat.ton === "attente" && progression ? ` · ${progression} %` : ""}
        </span>
    );
}

export default function AdminApercuVideo({ media, open, onOpenChange }) {
    const [pistes, setPistes] = useState(null);
    const [choisie, setChoisie] = useState(null);
    const [urlLecture, setUrlLecture] = useState(null);
    const [chargement, setChargement] = useState(false);

    // Un film n'a qu'une vidéo, une série en a une par épisode : la liste est
    // construite depuis la fiche plutôt que devinée à l'ouverture.
    const construire = useCallback(() => {
        if (!media) return [];
        if (media.type === "movie") {
            return [{
                cle: "film",
                libelle: media.title,
                videoId: media.bunny_video_id || null,
                params: undefined,
            }];
        }
        return (media.seasons || []).flatMap((saison) =>
            (saison.episodes || []).map((episode) => ({
                cle: `S${saison.season_number}E${episode.ep_number}`,
                libelle: `S${saison.season_number} · E${episode.ep_number}${episode.title ? ` — ${episode.title}` : ""}`,
                videoId: episode.bunny_video_id || null,
                params: { season_number: saison.season_number, episode_number: episode.ep_number },
            }))
        );
    }, [media]);

    useEffect(() => {
        if (!open || !media) return undefined;
        let actif = true;
        setUrlLecture(null);
        setChoisie(null);
        const liste = construire();
        setPistes(liste.map((p) => ({ ...p, statut: null })));

        (async () => {
            const avecEtat = await Promise.all(liste.map(async (piste) => {
                if (!piste.videoId) return { ...piste, statut: "absente" };
                try {
                    const r = await api.get(`/bunny/video-status/${piste.videoId}`, { silent: true });
                    return { ...piste, statut: r.data.status, progression: r.data.encodeProgress, resolutions: r.data.availableResolutions };
                } catch {
                    return { ...piste, statut: "introuvable" };
                }
            }));
            if (actif) setPistes(avecEtat);
        })();

        return () => { actif = false; };
    }, [open, media, construire]);

    const lire = async (piste) => {
        setChoisie(piste.cle);
        setUrlLecture(null);
        setChargement(true);
        try {
            const r = await api.get(`/bunny/playback/${media.id}`, { params: piste.params, silent: true });
            setUrlLecture(r.data?.url || null);
            if (!r.data?.url) toast.error("Aucune URL de lecture renvoyée");
        } catch (e) {
            showError(toast, e, "Lecture impossible");
        } finally {
            setChargement(false);
        }
    };

    const manquantes = (pistes || []).filter((p) => p.statut === "absente").length;
    const problemes = (pistes || []).filter((p) => p.statut === "introuvable" || p.statut === 5 || p.statut === 6).length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl border-[#262626] bg-[#0a0a0a] text-white">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl">
                        Vérifier « {media?.title} »
                    </DialogTitle>
                </DialogHeader>

                {pistes === null ? (
                    <div className="flex items-center gap-2.5 py-8 text-sm text-neutral-400">
                        <Loader2 size={15} className="animate-spin text-[#E8D2A6]" /> Lecture des fichiers…
                    </div>
                ) : (
                    <div className="space-y-4">
                        {(manquantes > 0 || problemes > 0) && (
                            <div className="flex gap-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-3 text-xs leading-relaxed text-amber-200">
                                <CircleAlert size={14} className="mt-0.5 shrink-0" />
                                <span>
                                    {manquantes > 0 && `${manquantes} sans fichier vidéo. `}
                                    {problemes > 0 && `${problemes} en erreur chez l'hébergeur.`}
                                </span>
                            </div>
                        )}

                        {urlLecture && (
                            <div className="relative overflow-hidden rounded-lg border border-[#262626]" style={{ aspectRatio: "16 / 9" }}>
                                <iframe
                                    src={urlLecture}
                                    title={`Vérification de ${media?.title}`}
                                    data-testid="apercu-lecteur"
                                    className="absolute inset-0 h-full w-full"
                                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                                    allowFullScreen
                                    referrerPolicy="strict-origin-when-cross-origin"
                                />
                                <button
                                    type="button"
                                    onClick={() => { setUrlLecture(null); setChoisie(null); }}
                                    aria-label="Fermer l'aperçu"
                                    className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white backdrop-blur transition-colors hover:bg-black"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-[#262626]">
                            {pistes.length === 0 ? (
                                <p className="px-4 py-8 text-center text-sm text-neutral-500">
                                    Aucun épisode enregistré sur cette fiche.
                                </p>
                            ) : pistes.map((piste) => (
                                <div
                                    key={piste.cle}
                                    className={`flex items-center gap-3 border-b border-[#1a1a1a] px-4 py-2.5 last:border-b-0 ${choisie === piste.cle ? "bg-[#E8D2A6]/[0.06]" : ""}`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm text-neutral-200">{piste.libelle}</div>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
                                            {piste.statut === "absente" ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                                                    <CircleAlert size={12} /> Aucun fichier
                                                </span>
                                            ) : piste.statut === "introuvable" ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs text-red-300">
                                                    <CircleAlert size={12} /> Absente de l&apos;hébergeur
                                                </span>
                                            ) : piste.statut === null ? (
                                                <span className="text-xs text-neutral-600">…</span>
                                            ) : (
                                                <Etat statut={piste.statut} progression={piste.progression} />
                                            )}
                                            {piste.resolutions && (
                                                <span className="text-xs text-neutral-600">{piste.resolutions}</span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={!piste.videoId || chargement}
                                        onClick={() => lire(piste)}
                                        data-testid={`apercu-lire-${piste.cle}`}
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#E8D2A6] px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#D4BB8B] disabled:cursor-not-allowed disabled:bg-[#1a1a1a] disabled:text-neutral-600"
                                    >
                                        {chargement && choisie === piste.cle
                                            ? <Loader2 size={12} className="animate-spin" />
                                            : <Play size={12} fill="currentColor" />}
                                        Regarder
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
