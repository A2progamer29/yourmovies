import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, X, CircleAlert, CircleCheck, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";

/** États renvoyés par l'hébergeur. Seul « prête » garantit une lecture : un
 *  fichier encore en traitement s'ouvre sur un écran noir, ce qu'il vaut mieux
 *  annoncer que laisser prendre pour une panne. */
const ETATS = {
    0: { texte: "En file d'attente", ton: "attente" },
    1: { texte: "Téléversement en cours", ton: "attente" },
    2: { texte: "Traitement en cours", ton: "attente" },
    3: { texte: "Encodage en cours", ton: "attente" },
    4: { texte: "Prête", ton: "pret" },
    5: { texte: "Échec du traitement", ton: "probleme" },
    6: { texte: "Bloquée par l'hébergeur", ton: "probleme" },
};

const TEINTES = {
    pret: "text-emerald-300",
    attente: "text-[#E8D2A6]",
    probleme: "text-red-300",
};

export default function VerifierVideo({ videoId, libraryId, compact = false }) {
    const [etat, setEtat] = useState(null);
    const [url, setUrl] = useState(null);
    const [occupe, setOccupe] = useState(false);

    const lireEtat = useCallback(async () => {
        if (!videoId) return;
        try {
            const r = await api.get(`/bunny/video-status/${videoId}`, {
                params: libraryId ? { library_id: libraryId } : undefined,
                silent: true,
            });
            setEtat(r.data);
        } catch {
            setEtat({ status: "introuvable" });
        }
    }, [videoId, libraryId]);

    useEffect(() => {
        setUrl(null);
        setEtat(null);
        lireEtat();
    }, [lireEtat]);

    // Un encodage en cours se termine sans prevenir : on redemande tant qu'il dure.
    useEffect(() => {
        if (!etat || etat.status === "introuvable" || etat.status >= 4) return undefined;
        const minuteur = window.setTimeout(lireEtat, 8000);
        return () => window.clearTimeout(minuteur);
    }, [etat, lireEtat]);

    const regarder = async () => {
        if (url) { setUrl(null); return; }
        setOccupe(true);
        try {
            const r = await api.get(`/admin/bunny/preview/${videoId}`, {
                params: libraryId ? { library_id: libraryId } : undefined,
                silent: true,
            });
            setUrl(r.data?.url || null);
        } catch (e) {
            showError(toast, e, "Aperçu impossible");
        } finally {
            setOccupe(false);
        }
    };

    if (!videoId) return null;

    const description = etat === null
        ? { texte: "Vérification…", ton: "attente", Icone: Loader2 }
        : etat.status === "introuvable"
            ? { texte: "Absente de l'hébergeur", ton: "probleme", Icone: CircleAlert }
            : (() => {
                const e = ETATS[etat.status] || { texte: "État inconnu", ton: "probleme" };
                const Icone = e.ton === "pret" ? CircleCheck : e.ton === "attente" ? Clock : CircleAlert;
                return { ...e, Icone };
            })();

    return (
        <div className={compact ? "mt-2" : "mt-3"} data-testid={`verifier-video-${videoId}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className={`inline-flex items-center gap-1.5 text-xs ${TEINTES[description.ton]}`}>
                    <description.Icone size={12} className={etat === null ? "animate-spin" : ""} />
                    {description.texte}
                    {description.ton === "attente" && etat?.encodeProgress ? ` · ${etat.encodeProgress} %` : ""}
                </span>

                {etat?.availableResolutions && (
                    <span className="text-xs text-neutral-600">{etat.availableResolutions}</span>
                )}

                <button
                    type="button"
                    onClick={regarder}
                    disabled={occupe || etat === null || etat.status === "introuvable"}
                    data-testid={`regarder-${videoId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#E8D2A6] px-3 py-1 text-[11px] font-semibold text-black transition-colors hover:bg-[#D4BB8B] disabled:cursor-not-allowed disabled:bg-[#1a1a1a] disabled:text-neutral-600"
                >
                    {occupe
                        ? <Loader2 size={11} className="animate-spin" />
                        : url ? <X size={11} /> : <Play size={11} fill="currentColor" />}
                    {url ? "Fermer" : "Regarder"}
                </button>
            </div>

            {url && (
                <div className="relative mt-2 overflow-hidden rounded-lg border border-[#262626]" style={{ aspectRatio: "16 / 9" }}>
                    <iframe
                        src={url}
                        title="Vérification de la vidéo"
                        data-testid="apercu-lecteur"
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                    />
                </div>
            )}
        </div>
    );
}
