import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2, TriangleAlert, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

const GO = 1024 ** 3;

function enGo(octets) {
    const valeur = (Number(octets) || 0) / GO;
    if (valeur >= 100) return `${Math.round(valeur)} Go`;
    if (valeur >= 1) return `${valeur.toFixed(1)} Go`;
    return `${((Number(octets) || 0) / (1024 * 1024)).toFixed(0)} Mo`;
}

function enDollars(montant) {
    const valeur = Number(montant) || 0;
    return valeur >= 10 ? `${valeur.toFixed(0)} $` : `${valeur.toFixed(2)} $`;
}

function enHeures(secondes) {
    const heures = (Number(secondes) || 0) / 3600;
    return heures >= 10 ? `${Math.round(heures)} h` : `${heures.toFixed(1)} h`;
}

const GENRES = { movie: "Film", series: "Série", anime: "Anime" };

function Carte({ legende, valeur, detail, ton }) {
    const couleur = ton === "alerte" ? "text-amber-400" : ton === "bien" ? "text-emerald-300" : "text-white";
    return (
        <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">{legende}</div>
            <div className={`mt-1.5 font-display text-2xl ${couleur}`}>{valeur}</div>
            {detail && <div className="mt-1 text-xs text-neutral-500">{detail}</div>}
        </div>
    );
}

export default function AdminInventaire() {
    const [rapport, setRapport] = useState(null);
    const [chargement, setChargement] = useState(true);
    const [dormantsSeuls, setDormantsSeuls] = useState(false);
    const [enCours, setEnCours] = useState("");

    const charger = useCallback(async (silencieux) => {
        if (!silencieux) setChargement(true);
        try {
            const r = await api.get("/admin/storage/inventory", { silent: true });
            setRapport(r.data);
        } catch (e) {
            showError(toast, e, "Inventaire indisponible");
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const prix = rapport?.price_per_gb ?? 0.01;
    const cout = useCallback((octets) => ((Number(octets) || 0) / GO) * prix, [prix]);

    const lignes = useMemo(() => {
        const items = rapport?.items || [];
        return dormantsSeuls ? items.filter((i) => i.views === 0) : items;
    }, [rapport, dormantsSeuls]);

    const liberer = async (item) => {
        const economie = enDollars(cout(item.bytes));
        if (!window.confirm(
            `Supprimer les ${item.videos} vidéo(s) de « ${item.title} » ?\n\n`
            + `La fiche reste au catalogue avec son affiche, son résumé, ses avis et ses votes — `
            + `seuls les fichiers partent, et ils sont perdus définitivement.\n\n`
            + `Espace libéré : ${enGo(item.bytes)} · ${economie} par mois.`
        )) return;
        if (!window.confirm(`Dernière confirmation : ${enGo(item.bytes)} seront définitivement supprimés de l'hébergeur.`)) return;

        setEnCours(item.id);
        try {
            const r = await api.post("/admin/storage/release", { media_id: item.id });
            toast.success(`${r.data.deleted} vidéo(s) supprimée(s) · ${economie}/mois économisés`);
            await charger(true);
        } catch (e) {
            showError(toast, e, "Libération impossible");
        } finally {
            setEnCours("");
        }
    };

    if (chargement) {
        return (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#262626] bg-[#0a0a0a] p-8 text-sm text-neutral-400">
                <Loader2 size={15} className="animate-spin text-[#E8D2A6]" />
                Lecture de la bibliothèque — quelques secondes, elle est parcourue page par page.
            </div>
        );
    }

    if (!rapport) return null;

    const coutTotal = cout(rapport.total_bytes);
    const coutDormant = cout(rapport.cold_bytes);
    const apresMenage = Math.max(rapport.minimum_monthly || 0, coutTotal - coutDormant);
    const diffusion = rapport.bandwidth_30d_bytes;

    return (
        <div className="space-y-5" data-testid="admin-inventaire">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Carte
                    legende="Coût mensuel"
                    valeur={enDollars(coutTotal)}
                    detail={`${enGo(rapport.total_bytes)} stockés`}
                    ton={coutTotal > 5 ? "alerte" : "bien"}
                />
                <Carte
                    legende="Jamais regardés"
                    valeur={enDollars(coutDormant)}
                    detail={`${rapport.cold_count} titre${rapport.cold_count > 1 ? "s" : ""} · ${enGo(rapport.cold_bytes)}`}
                    ton={rapport.cold_count > 0 ? "alerte" : "bien"}
                />
                <Carte
                    legende="Après ménage"
                    valeur={enDollars(apresMenage)}
                    detail={`facture minimale ${enDollars(rapport.minimum_monthly)}`}
                    ton="bien"
                />
                <Carte
                    legende="Diffusion sur 30 j"
                    valeur={diffusion === null || diffusion === undefined ? "—" : enGo(diffusion)}
                    detail={diffusion ? `soit ${enDollars((diffusion / GO) * 0.005)}` : "coût négligeable"}
                />
            </div>

            <div className="flex gap-3 rounded-xl border border-[#262626] bg-[#0a0a0a] p-4 text-sm leading-relaxed text-neutral-400">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                <p>
                    C&apos;est le stockage qui est facturé, pas le visionnage : garder un titre en ligne
                    coûte tous les mois, qu&apos;on le regarde ou non. Libérer un titre supprime ses
                    fichiers mais garde sa fiche — il reste visible au catalogue et redemandable sur le
                    Wishboard. Tarif appliqué : {prix.toFixed(3)} $ par Go et par mois.
                </p>
            </div>

            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a]">
                <div className="flex flex-wrap items-center gap-3 border-b border-[#262626] px-5 py-3.5">
                    <span className="text-xs uppercase tracking-widest text-neutral-500">
                        {rapport.titles} titre{rapport.titles > 1 ? "s" : ""} · {rapport.video_count} vidéos
                    </span>
                    <Button
                        onClick={() => setDormantsSeuls((v) => !v)}
                        data-testid="filtre-dormants"
                        className={`h-9 rounded-full px-4 text-xs font-semibold ${dormantsSeuls
                            ? "bg-[#E8D2A6] text-black hover:bg-[#D4BB8B]"
                            : "bg-[#161616] text-neutral-300 hover:bg-[#1f1f1f]"}`}
                    >
                        {dormantsSeuls ? <EyeOff size={13} className="mr-2" /> : <Eye size={13} className="mr-2" />}
                        {dormantsSeuls ? "Jamais regardés" : "Tout afficher"}
                    </Button>
                    <Button
                        onClick={() => charger()}
                        data-testid="rafraichir-inventaire"
                        className="ml-auto h-9 rounded-full bg-[#161616] px-4 text-xs font-semibold text-neutral-300 hover:bg-[#1f1f1f]"
                    >
                        <RefreshCw size={13} className="mr-2" /> Actualiser
                    </Button>
                </div>

                <div className="hidden border-b border-[#1a1a1a] px-5 py-2 text-[10px] uppercase tracking-widest text-neutral-500 sm:grid sm:grid-cols-[1fr_70px_60px_70px_80px_70px_110px] sm:gap-3">
                    <span>Titre</span>
                    <span className="text-right">Vidéos</span>
                    <span className="text-right">Durée</span>
                    <span className="text-right">Poids</span>
                    <span className="text-right">Coût/mois</span>
                    <span className="text-right">Vues</span>
                    <span />
                </div>

                <div className="max-h-[560px] overflow-y-auto">
                    {lignes.length === 0 ? (
                        <p className="px-5 py-10 text-center text-sm text-neutral-500">
                            Aucun titre dans cette vue.
                        </p>
                    ) : lignes.map((item) => (
                        <div
                            key={item.id}
                            className="grid gap-2 border-b border-[#1a1a1a] px-5 py-3 text-sm last:border-b-0 hover:bg-white/[0.02] sm:grid-cols-[1fr_70px_60px_70px_80px_70px_110px] sm:items-center sm:gap-3"
                        >
                            <div className="min-w-0">
                                <div className="truncate text-neutral-200">{item.title}</div>
                                <div className="text-xs text-neutral-600">
                                    {GENRES[item.type] || item.type}
                                    {item.player_broken ? " · déjà libéré" : ""}
                                </div>
                            </div>
                            <span className="text-xs tabular-nums text-neutral-500 sm:text-right">{item.videos}</span>
                            <span className="text-xs tabular-nums text-neutral-500 sm:text-right">{enHeures(item.seconds)}</span>
                            <span className="text-xs tabular-nums text-neutral-300 sm:text-right">{enGo(item.bytes)}</span>
                            <span className="text-xs tabular-nums text-[#E8D2A6] sm:text-right">{enDollars(cout(item.bytes))}</span>
                            <span className={`text-xs tabular-nums sm:text-right ${item.views === 0 ? "text-amber-400" : "text-neutral-400"}`}>
                                {item.views === 0 ? "aucune" : item.views}
                            </span>
                            <Button
                                onClick={() => liberer(item)}
                                disabled={enCours === item.id}
                                data-testid={`liberer-${item.id}`}
                                className="h-8 rounded-full bg-red-500/15 px-3 text-[11px] font-semibold text-red-300 hover:bg-red-500/25 disabled:bg-[#161616] disabled:text-neutral-600 sm:justify-self-end"
                            >
                                {enCours === item.id
                                    ? <Loader2 size={12} className="mr-1.5 animate-spin" />
                                    : <Trash2 size={12} className="mr-1.5" />}
                                Libérer
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
