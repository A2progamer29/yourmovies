import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Crown, Download, Film, Gauge, HardDrive, Play, Trash2, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOfflineDownloads } from "@/context/OfflineDownloadsContext";
import { formatOfflineRate, formatOfflineSize } from "@/lib/offline";

function typeLabel(download) {
    if (download.type === "movie") return "Film";
    return `${download.type === "anime" ? "Animé" : "Série"} · Saison ${download.season_number} · Épisode ${download.episode_number}`;
}

function PremiumGate() {
    const navigate = useNavigate();
    return (
        <section className="relative overflow-hidden rounded-3xl border border-[#E8D2A6]/25 bg-[#0a0a0a] px-6 py-9 sm:px-9" data-testid="offline-premium-required">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#E8D2A6]/10 blur-3xl" />
            <div className="relative max-w-xl">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#E8D2A6]/30 bg-[#E8D2A6]/10 text-[#E8D2A6]">
                    <Crown size={21} />
                </div>
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#E8D2A6]">Exclusivité Premium</span>
                <h2 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">Votre cinéma, même hors connexion.</h2>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-neutral-400">
                    Emportez vos films, séries et animés dans ce navigateur, puis retrouvez-les même sans réseau.
                    Aucun fichier n’est ajouté au dossier Téléchargements de votre appareil.
                </p>
                <Button onClick={() => navigate("/pricing")} className="mt-7 h-11 rounded-full bg-[#E8D2A6] px-6 font-semibold text-black hover:bg-[#D4BB8B]">
                    <Crown size={15} className="mr-2" /> Découvrir Premium
                </Button>
            </div>
        </section>
    );
}

export default function OfflineDownloadsPanel() {
    const navigate = useNavigate();
    const { eligible, downloads, progress, storage, remove, cancel } = useOfflineDownloads();
    const [removing, setRemoving] = useState(null);
    if (!eligible) return <PremiumGate />;

    const totalBytes = downloads.reduce((sum, download) => sum + Number(download.size_bytes || 0), 0);
    const quotaPercent = storage.quota ? Math.min(100, Math.round((storage.usage / storage.quota) * 100)) : 0;
    const activeDownloads = Object.values(progress);

    const erase = async (download) => {
        if (!window.confirm(`Supprimer « ${download.title} » de cet appareil ?`)) return;
        setRemoving(download.id);
        try {
            await remove(download.id);
            toast.success("Téléchargement supprimé");
        } catch {
            toast.error("Impossible de supprimer ce téléchargement");
        } finally {
            setRemoving(null);
        }
    };

    return (
        <div className="space-y-7" data-testid="offline-downloads-panel">
            <section className="relative overflow-hidden rounded-3xl border border-[#262626] bg-[#0a0a0a] p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-[#E8D2A6]/[0.07] blur-3xl" />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#E8D2A6]">
                            <WifiOff size={13} /> Téléchargements Premium
                        </div>
                        <h2 className="mt-2 font-display text-3xl tracking-tight">Votre cinéma hors connexion</h2>
                        <p className="mt-2 max-w-lg text-sm leading-relaxed text-neutral-400">
                            Vos films et épisodes sont conservés uniquement dans ce navigateur et restent accessibles sans connexion.
                        </p>
                    </div>
                </div>

                <div className="relative mt-7 rounded-2xl border border-[#262626] bg-[#111] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 text-neutral-300"><HardDrive size={15} className="text-[#E8D2A6]" /> Espace utilisé</span>
                        <span className="font-medium tabular-nums text-white">{formatOfflineSize(totalBytes)}</span>
                    </div>
                    {storage.quota > 0 && (
                        <>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#262626]">
                                <div className="h-full rounded-full bg-[#E8D2A6] transition-all" style={{ width: `${quotaPercent}%` }} />
                            </div>
                            <p className="mt-2 text-xs text-neutral-500">{formatOfflineSize(storage.usage)} utilisés sur environ {formatOfflineSize(storage.quota)} autorisés par ce navigateur.</p>
                        </>
                    )}
                </div>
            </section>

            {activeDownloads.length > 0 && (
                <section className="space-y-3" data-testid="offline-active-downloads">
                    <div className="flex items-center justify-between px-1">
                        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#E8D2A6]"><Download size={13} /> Téléchargements en cours</span>
                        <span className="text-xs tabular-nums text-neutral-500">{activeDownloads.length} actif{activeDownloads.length > 1 ? "s" : ""}</span>
                    </div>
                    {activeDownloads.map((current) => {
                        const percent = Number.isFinite(current.percent) ? Math.max(0, Math.min(100, current.percent)) : null;
                        return (
                            <article key={current.id} className="overflow-hidden rounded-2xl border border-[#E8D2A6]/30 bg-[#0a0a0a] p-4" data-testid={`offline-active-${current.media_id}`}>
                                <div className="flex items-center gap-4">
                                    {current.poster_url ? (
                                        <img src={current.poster_url} alt="" className="h-20 w-14 shrink-0 rounded-lg border border-[#262626] object-cover" />
                                    ) : (
                                        <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-[#262626] bg-[#111] text-[#E8D2A6]"><Film size={18} /></div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] uppercase tracking-[0.16em] text-[#E8D2A6]">{typeLabel(current)}</p>
                                        <h3 className="mt-1 truncate font-display text-lg text-white">{current.title}</h3>
                                        {current.episode_title && <p className="truncate text-xs text-neutral-400">{current.episode_title}</p>}
                                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#262626]">
                                            <div className={`h-full rounded-full bg-[#E8D2A6] transition-[width] duration-300 ${percent === null ? "w-1/3 animate-pulse" : ""}`} style={percent === null ? undefined : { width: `${percent}%` }} />
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                                            <span className="text-neutral-400">{percent === null ? "Préparation…" : `${Math.round(percent)} %`} · {formatOfflineSize(current.bytes)} reçus</span>
                                            <span className="inline-flex items-center gap-1.5 font-medium text-[#E8D2A6]" title="Débit moyen depuis le début du téléchargement"><Gauge size={12} /> {formatOfflineRate(current.rate_bps)}</span>
                                        </div>
                                    </div>
                                    <Button onClick={() => cancel(current.id)} variant="outline" aria-label={`Annuler le téléchargement de ${current.title}`} className="h-9 w-9 shrink-0 self-start rounded-full border-[#262626] bg-transparent p-0 text-neutral-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400">
                                        <X size={15} />
                                    </Button>
                                </div>
                            </article>
                        );
                    })}
                </section>
            )}

            {downloads.length === 0 && activeDownloads.length === 0 ? (
                <section className="flex flex-col items-center rounded-3xl border border-dashed border-[#343434] px-6 py-14 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#262626] bg-[#111] text-[#E8D2A6]"><Film size={23} /></div>
                    <h3 className="font-display text-2xl">Aucun téléchargement</h3>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-500">Ouvrez un film, une série ou un animé, puis choisissez Télécharger pour l’emporter partout.</p>
                    <Button onClick={() => navigate("/browse")} variant="outline" className="mt-6 h-10 rounded-full border-[#262626] bg-transparent px-5 text-white hover:border-[#E8D2A6]/60 hover:bg-white/5">Explorer le catalogue</Button>
                </section>
            ) : downloads.length > 0 ? (
                <section className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Disponibles sur cet appareil</span>
                        <span className="text-xs tabular-nums text-neutral-500">{downloads.length} contenu{downloads.length > 1 ? "s" : ""}</span>
                    </div>
                    {downloads.map((download) => (
                        <article key={download.id} className="group flex flex-col gap-4 rounded-2xl border border-[#262626] bg-[#0a0a0a] p-4 transition-colors hover:border-[#E8D2A6]/30 sm:flex-row sm:items-center" data-testid={`offline-item-${download.media_id}`}>
                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                {download.poster_url ? (
                                    <img src={download.poster_url} alt="" className="h-24 w-16 shrink-0 rounded-lg border border-[#262626] object-cover" />
                                ) : (
                                    <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg border border-[#262626] bg-[#111] text-[#E8D2A6]"><Film size={20} /></div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#E8D2A6]">{typeLabel(download)}</p>
                                    <h3 className="mt-1 truncate font-display text-xl text-white">{download.title}</h3>
                                    {download.episode_title && <p className="truncate text-sm text-neutral-400">{download.episode_title}</p>}
                                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                        <span className="inline-flex items-center gap-1 text-[#E8D2A6]"><Check size={12} /> Disponible</span>
                                        <span>·</span><span>{formatOfflineSize(download.size_bytes)}</span>
                                        {download.quality && <><span>·</span><span>{download.quality}</span></>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                <Button onClick={() => navigate(`/offline/${encodeURIComponent(download.id)}`)} className="h-10 rounded-full bg-[#E8D2A6] px-5 font-semibold text-black hover:bg-[#D4BB8B]" data-testid={`offline-play-${download.media_id}`}>
                                    <Play size={14} className="mr-2" fill="currentColor" /> Regarder
                                </Button>
                                <Button onClick={() => erase(download)} disabled={removing === download.id} variant="outline" aria-label={`Supprimer ${download.title}`} className="h-10 w-10 rounded-full border-[#262626] bg-transparent p-0 text-neutral-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400">
                                    <Trash2 size={15} />
                                </Button>
                            </div>
                        </article>
                    ))}
                </section>
            ) : null}
        </div>
    );
}
