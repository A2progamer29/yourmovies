import PlayerLoading from "@/components/PlayerLoading";
import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Crown, WifiOff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import VideoPlayer from "@/components/VideoPlayer";
import { useAuth } from "@/context/AuthContext";
import { useOfflineDownloads } from "@/context/OfflineDownloadsContext";
import { getOfflineDownload, offlinePlaybackUrl } from "@/lib/offline";

export default function OfflineWatchPage() {
    const { downloadId } = useParams();
    const navigate = useNavigate();
    const { user, loading } = useAuth();
    const { eligible } = useOfflineDownloads();
    const [download, setDownload] = useState(null);
    const [searching, setSearching] = useState(true);

    useEffect(() => {
        if (loading) return undefined;
        if (!eligible || !user?.user_id) {
            setSearching(false);
            return undefined;
        }
        let active = true;
        getOfflineDownload(downloadId, user.user_id)
            .then((result) => { if (active) setDownload(result); })
            .catch(() => { if (active) setDownload(null); })
            .finally(() => { if (active) setSearching(false); });
        return () => { active = false; };
    }, [downloadId, eligible, loading, user?.user_id]);

    if (!loading && !user) return <Navigate to="/login" replace />;
    if (!loading && !eligible) return <Navigate to="/pricing" replace />;

    const subtitle = download?.type !== "movie" && download
        ? `Saison ${download.season_number} · Épisode ${download.episode_number}${download.episode_title ? ` — ${download.episode_title}` : ""}`
        : "Disponible hors connexion";

    return (
        <div className="min-h-screen bg-[#050505] text-white" data-testid="offline-watch-page">
            <header className="border-b border-[#262626] bg-[#050505]/95">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                    <Link to="/" className="font-display text-xl tracking-tight text-white">your<span className="text-[#E8D2A6]">movies</span></Link>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8D2A6]/25 bg-[#E8D2A6]/10 px-3 py-1 text-xs text-[#E8D2A6]"><WifiOff size={13} /> Hors connexion</span>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-6 py-8">
                <button type="button" onClick={() => navigate("/settings?tab=downloads")} className="mb-7 flex items-center gap-1 text-sm text-neutral-400 transition-colors hover:text-[#E8D2A6]">
                    <ChevronLeft size={16} /> Mes téléchargements
                </button>

                {searching || loading ? (
                    <PlayerLoading label="Ouverture de la vidéo hors connexion…" />
                ) : !download ? (
                    <section className="rounded-3xl border border-[#262626] bg-[#0a0a0a] px-6 py-14 text-center">
                        <Crown size={28} className="mx-auto text-[#E8D2A6]" />
                        <h1 className="mt-4 font-display text-3xl">Ce téléchargement n’est plus disponible</h1>
                        <p className="mt-2 text-sm text-neutral-400">Vérifiez votre abonnement Premium ou téléchargez de nouveau ce contenu.</p>
                        <Button onClick={() => navigate("/settings?tab=downloads")} className="mt-6 rounded-full bg-[#E8D2A6] text-black hover:bg-[#D4BB8B]">Retour aux téléchargements</Button>
                    </section>
                ) : (
                    <>
                        <div className="mb-5">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[#E8D2A6]">Lecture Premium hors connexion</p>
                            <h1 className="mt-1 font-display text-3xl tracking-tight sm:text-4xl">{download.title}</h1>
                            <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                            <VideoPlayer
                                key={download.id}
                                downloadControl={<Link to="/settings?tab=downloads" className="ym-player-button" aria-label="Gérer les téléchargements" data-tooltip="Mes téléchargements"><Download aria-hidden="true" /></Link>}
                                manifestUrl={download.kind === "hls" ? offlinePlaybackUrl(download) : null}
                                qualitySources={download.kind === "file" ? [{ quality: download.quality || "720p", url: offlinePlaybackUrl(download) }] : []}
                                poster={download.poster_url || undefined}
                                userMaxQuality="4k"
                                runAds={false}
                                boostInitial={user?.audio_boost || 1}
                                fiche={{ titre: download.title, logo: download.media?.title_logo_url, sousTitre: subtitle, affiche: download.poster_url, description: download.media?.description }}
                            />
                        </div>
                        {download.media?.description && <p className="mt-7 max-w-3xl text-sm leading-relaxed text-neutral-400">{download.media.description}</p>}
                    </>
                )}
            </main>
        </div>
    );
}
