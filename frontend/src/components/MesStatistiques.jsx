import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Film, Tv, Loader2, Info } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";

// Palette catégorielle validée pour fond sombre : bandes de clarté, plancher de
// chroma, séparation daltonisme et contraste tous vérifiés avant intégration.
const TEINTES = { movie: "#3987e5", series: "#d95926", anime: "#199e70" };
const SURFACE = "#0a0a0a";

/** Décompose une durée en jours, heures et minutes. Le total brut en heures est
 *  donné à part : c'est le chiffre qu'on retient, « 12 j 5 h » se compare mal. */
function decomposer(secondes) {
    const total = Math.max(0, Math.round(secondes || 0));
    return {
        jours: Math.floor(total / 86400),
        heures: Math.floor((total % 86400) / 3600),
        minutes: Math.floor((total % 3600) / 60),
        heuresTotales: Math.floor(total / 3600),
    };
}

function enClair(secondes) {
    const { jours, heures, minutes } = decomposer(secondes);
    if (jours) return `${jours} j ${heures} h`;
    if (heures) return `${heures} h ${minutes} min`;
    return `${minutes} min`;
}

/** Anneau part-à-tout. Trois parts seulement, séparées par un intervalle de 2 px
 *  de la couleur du fond — l'identité ne repose donc pas que sur la teinte. */
function Anneau({ parts, total }) {
    const rayon = 70;
    const epaisseur = 26;
    const circonference = 2 * Math.PI * rayon;
    let parcouru = 0;

    return (
        <svg viewBox="0 0 180 180" className="h-[180px] w-[180px] shrink-0" role="img" aria-label="Répartition du temps par catégorie">
            <g transform="translate(90 90) rotate(-90)">
                <circle r={rayon} fill="none" stroke="#161616" strokeWidth={epaisseur} />
                {parts.map((part) => {
                    const fraction = total ? part.secondes / total : 0;
                    const longueur = Math.max(0, fraction * circonference - 2);
                    const element = (
                        <circle
                            key={part.cle}
                            r={rayon}
                            fill="none"
                            stroke={TEINTES[part.cle]}
                            strokeWidth={epaisseur}
                            strokeDasharray={`${longueur} ${circonference - longueur}`}
                            strokeDashoffset={-parcouru}
                        >
                            <title>{`${part.libelle} — ${enClair(part.secondes)}`}</title>
                        </circle>
                    );
                    parcouru += fraction * circonference;
                    return element;
                })}
            </g>
            <circle cx="90" cy="90" r={rayon - epaisseur / 2 - 1} fill={SURFACE} />
        </svg>
    );
}

function Chiffre({ valeur, legende }) {
    return (
        <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-4">
            <div className="font-display text-3xl tabular-nums text-white">{valeur}</div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-neutral-500">{legende}</div>
        </div>
    );
}

export default function MesStatistiques() {
    const [stats, setStats] = useState(null);

    const charger = useCallback(async () => {
        try {
            const r = await api.get("/me/stats", { silent: true });
            setStats(r.data);
        } catch (e) {
            setStats({ total_seconds: 0, repartition: [] });
            showError(toast, e, "Chargement des statistiques impossible");
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    if (!stats) {
        return (
            <div className="flex items-center gap-2.5 rounded-lg border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" /> Calcul de tes statistiques…
            </div>
        );
    }

    const total = stats.total_seconds || 0;
    const { jours, heures, minutes, heuresTotales } = decomposer(total);
    const parts = (stats.repartition || []).filter((p) => p.secondes > 0);

    return (
        <div className="space-y-5" data-testid="mes-statistiques">
            <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                    <Clock size={13} className="text-[#E8D2A6]" /> Temps de visionnage
                </div>
                <div className="mt-3 font-display text-4xl tabular-nums text-white sm:text-5xl">
                    {jours > 0 && <>{jours} <span className="text-2xl text-neutral-500">j</span> </>}
                    {heures} <span className="text-2xl text-neutral-500">h</span>{" "}
                    {minutes} <span className="text-2xl text-neutral-500">min</span>
                </div>
                <p className="mt-2 text-sm text-neutral-500">
                    Soit {heuresTotales.toLocaleString("fr-FR")} heure{heuresTotales > 1 ? "s" : ""} au total.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Chiffre valeur={stats.films_termines ?? 0} legende="Films terminés" />
                <Chiffre valeur={stats.episodes_vus ?? 0} legende="Épisodes vus" />
                <Chiffre valeur={stats.titres_commences ?? 0} legende="Titres commencés" />
            </div>

            <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-6">
                <h3 className="text-sm font-medium text-white">Répartition de ton temps</h3>

                {parts.length === 0 ? (
                    <p className="mt-4 text-sm text-neutral-500">
                        Rien à répartir pour l&apos;instant — lance un film ou un épisode et reviens ici.
                    </p>
                ) : (
                    <div className="mt-5 flex flex-col items-center gap-7 sm:flex-row sm:items-center">
                        <Anneau parts={parts} total={total} />

                        <ul className="w-full space-y-3">
                            {parts.map((part) => {
                                const pct = total ? Math.round((part.secondes / total) * 100) : 0;
                                return (
                                    <li key={part.cle} className="flex items-center gap-3">
                                        <span
                                            className="h-3 w-3 shrink-0 rounded-sm"
                                            style={{ backgroundColor: TEINTES[part.cle] }}
                                            aria-hidden="true"
                                        />
                                        <span className="flex-1 text-sm text-neutral-300">{part.libelle}</span>
                                        <span className="text-sm tabular-nums text-white">{pct} %</span>
                                        <span className="w-24 text-right text-xs tabular-nums text-neutral-500">
                                            {enClair(part.secondes)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            <div className="flex gap-3 rounded-lg border border-[#262626] bg-[#0a0a0a] p-4 text-sm text-neutral-400">
                <Info size={16} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                <p className="leading-relaxed">
                    Le temps est compté depuis la mise en place de cette page. Ce que tu as regardé
                    avant n&apos;a jamais été mesuré — seule ta position dans chaque titre était
                    enregistrée — et n&apos;apparaît donc pas dans le total.
                </p>
            </div>
        </div>
    );
}
