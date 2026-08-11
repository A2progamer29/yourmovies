import React, { useMemo, useRef, useState } from "react";
import { UploadCloud, Check, AlertTriangle, Loader2, X, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Devine la saison et l'épisode depuis un nom de fichier.
 * Retourne { season, episode } — season peut être null (à déduire).
 */
export function parseEpisodeFromName(name) {
    const base = String(name || "").replace(/\.[^.]+$/, "");
    let m;

    // S01E02 · s1e2 · S01.E02 · S01 EP02
    m = base.match(/[Ss](\d{1,2})[\s._\-]*[EeÉé][Pp]?[\s._\-]*(\d{1,3})/);
    if (m) return { season: +m[1], episode: +m[2] };

    // 1x02 · 01x02
    m = base.match(/(?:^|[^\d])(\d{1,2})\s*[xX]\s*(\d{1,3})(?!\d)/);
    if (m) return { season: +m[1], episode: +m[2] };

    // Saison 1 ... Épisode 2 (ou Season / Episode)
    m = base.match(/sais?on\s*(\d{1,2})[\s\S]*?[ée]pisode\s*(\d{1,3})/i)
        || base.match(/season\s*(\d{1,2})[\s\S]*?episode\s*(\d{1,3})/i);
    if (m) return { season: +m[1], episode: +m[2] };

    // Épisode 12 · Ep 12 · E12 (saison à déduire)
    m = base.match(/[ée]pisode\s*(\d{1,3})/i) || base.match(/\bep\.?\s*(\d{1,3})\b/i) || base.match(/\bE(\d{1,3})\b/);
    if (m) return { season: null, episode: +m[1] };

    // Style anime : « Titre - 12 »
    m = base.match(/[-–—]\s*(\d{1,3})\s*(?:$|\[|\(|v\d)/);
    if (m) return { season: null, episode: +m[1] };

    return null;
}

/** Associe un fichier à un épisode existant. */
export function matchFileToEpisode(fileName, seasons) {
    const parsed = parseEpisodeFromName(fileName);
    if (!parsed) return { parsed: null, si: -1, ei: -1 };

    const list = Array.isArray(seasons) ? seasons : [];
    let si = -1;
    if (parsed.season != null) {
        si = list.findIndex((s, i) => (Number(s.season_number) || i + 1) === parsed.season);
    } else if (list.length === 1) {
        si = 0; // une seule saison : aucune ambiguïté
    }
    if (si < 0) return { parsed, si: -1, ei: -1 };

    const episodes = Array.isArray(list[si].episodes) ? list[si].episodes : [];
    const ei = episodes.findIndex((e, j) => (Number(e.ep_number) || j + 1) === parsed.episode);
    return { parsed, si, ei };
}

export default function BulkEpisodeUpload({ seasons, title, uploadToBunny, updateEpisode, activeUpload, scopedUploadKey }) {
    const [files, setFiles] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [running, setRunning] = useState(false);
    const [current, setCurrent] = useState(null);
    const [done, setDone] = useState({});
    const inputRef = useRef(null);

    const rows = useMemo(() => {
        const mapped = files.map((file) => {
            const { parsed, si, ei } = matchFileToEpisode(file.name, seasons);
            const season = si >= 0 ? seasons[si] : null;
            const episode = si >= 0 && ei >= 0 ? season.episodes[ei] : null;
            const seasonNo = season ? (Number(season.season_number) || si + 1) : 9999;
            const epNo = episode ? (Number(episode.ep_number) || ei + 1) : 9999;
            return { file, parsed, si, ei, season, episode, seasonNo, epNo, key: `bulk_s${si}_e${ei}` };
        });
        // Ordre logique S1E1 → S1E2 → S2E1, indépendant de l'ordre de dépôt.
        return mapped.sort((a, b) => (a.seasonNo - b.seasonNo) || (a.epNo - b.epNo) || a.file.name.localeCompare(b.file.name));
    }, [files, seasons]);

    const ready = rows.filter((r) => r.si >= 0 && r.ei >= 0);
    const unmatched = rows.filter((r) => r.si < 0 || r.ei < 0);

    const addFiles = (list) => {
        const incoming = Array.from(list || []).filter((f) => f.type.startsWith("video/") || /\.(mp4|mkv|webm|mov)$/i.test(f.name));
        setFiles((current) => {
            const names = new Set(current.map((f) => f.name));
            return [...current, ...incoming.filter((f) => !names.has(f.name))];
        });
    };

    const startAll = async () => {
        setRunning(true);
        const queue = [...ready];
        for (const row of queue) {
            if (done[row.file.name]) continue;
            setCurrent(row.file.name);
            try {
                // On attend la fin du *transfert* seulement : l'encodage Bunny se
                // poursuit en arrière-plan pendant que le fichier suivant démarre.
                await new Promise((resolve, reject) => {
                    uploadToBunny(row.file, {
                        key: row.key,
                        title: `${title || "Épisode"} — S${row.seasonNo}E${row.epNo}`,
                        onReference: (reference) => updateEpisode(row.si, row.ei, reference),
                        onTransferred: resolve,
                    }).then(resolve).catch(reject);
                });
                setDone((d) => ({ ...d, [row.file.name]: "ok" }));
            } catch {
                setDone((d) => ({ ...d, [row.file.name]: "error" }));
            }
            // Court répit entre deux envois : laisse Bunny et la connexion respirer.
            await new Promise((r) => setTimeout(r, 1200));
        }
        setCurrent(null);
        setRunning(false);
    };

    return (
        <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
            <div className="flex items-center gap-2 mb-1">
                <UploadCloud size={18} className="text-[#E8D2A6]" />
                <h4 className="font-display text-lg text-white">Dépôt automatique des épisodes</h4>
            </div>
            <p className="text-xs text-neutral-500 mb-4">
                Dépose tous tes fichiers d&apos;un coup : ils sont rangés au bon épisode d&apos;après leur nom
                (<span className="text-neutral-400">S01E02</span>, <span className="text-neutral-400">1x02</span>,
                <span className="text-neutral-400"> Épisode 2</span>…) puis téléversés l&apos;un après l&apos;autre.
            </p>

            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-[#E8D2A6] bg-[#E8D2A6]/5" : "border-[#262626] hover:border-[#E8D2A6]/50"}`}
                data-testid="bulk-dropzone"
            >
                <UploadCloud size={26} className="mx-auto text-neutral-500 mb-2" />
                <div className="text-sm text-neutral-300">Dépose tes fichiers ici, ou clique pour les choisir</div>
                <div className="text-[11px] text-neutral-600 mt-1">MP4, MKV, WEBM, MOV — plusieurs fichiers à la fois</div>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="video/*,.mkv"
                    className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                />
            </div>

            {rows.length > 0 && (
                <>
                    <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto">
                        {rows.map((r) => {
                            const state = done[r.file.name];
                            const matched = r.si >= 0 && r.ei >= 0;
                            const live = matched && activeUpload ? activeUpload(scopedUploadKey ? scopedUploadKey(r.key) : r.key) : null;
                            const isCurrent = current === r.file.name;
                            return (
                                <div key={r.file.name} className={`rounded-lg border px-3 py-2 ${isCurrent ? "border-[#E8D2A6]/40 bg-[#171208]" : "border-[#1a1a1a] bg-[#111]"}`}>
                                    <div className="flex items-center gap-3">
                                        <span className="shrink-0">
                                            {state === "ok" ? <Check size={14} className="text-emerald-400" />
                                                : state === "error" ? <AlertTriangle size={14} className="text-red-400" />
                                                    : isCurrent ? <Loader2 size={14} className="text-[#E8D2A6] animate-spin" />
                                                        : matched ? <Film size={14} className="text-[#E8D2A6]" />
                                                            : <AlertTriangle size={14} className="text-amber-400" />}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-xs text-neutral-300" title={r.file.name}>{r.file.name}</span>
                                        <span className="shrink-0 text-[11px]">
                                            {matched
                                                ? <span className="text-[#E8D2A6]">S{r.seasonNo}E{r.epNo}</span>
                                                : r.parsed
                                                    ? <span className="text-amber-400">épisode introuvable</span>
                                                    : <span className="text-neutral-500">nom non reconnu</span>}
                                        </span>
                                        {!running && (
                                            <button
                                                type="button"
                                                onClick={() => setFiles((f) => f.filter((x) => x.name !== r.file.name))}
                                                className="shrink-0 text-neutral-600 hover:text-red-400"
                                                aria-label="Retirer"
                                            >
                                                <X size={13} />
                                            </button>
                                        )}
                                    </div>
                                    {live && (
                                        <div className="mt-2 pl-7">
                                            <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1">
                                                <span>{live.stage || "Envoi"}</span>
                                                <span className="text-[#E8D2A6] tabular-nums">{live.progress || 0}%</span>
                                            </div>
                                            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                                                <div className="h-full bg-[#E8D2A6] transition-all duration-300" style={{ width: `${live.progress || 0}%` }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-neutral-500">
                            <span className="text-[#E8D2A6]">{ready.length}</span> prêt{ready.length > 1 ? "s" : ""}
                            {unmatched.length > 0 && <> · <span className="text-amber-400">{unmatched.length}</span> à placer à la main</>}
                            {Object.values(done).includes("ok") && (
                                <div className="mt-1 text-emerald-400">Pense à enregistrer la fiche pour conserver les épisodes ajoutés.</div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {!running && <Button type="button" variant="outline" onClick={() => { setFiles([]); setDone({}); }} className="border-[#262626] bg-transparent text-neutral-300 hover:bg-white/5 rounded-full h-9">Vider</Button>}
                            <Button
                                type="button"
                                onClick={startAll}
                                disabled={running || ready.length === 0}
                                data-testid="bulk-start"
                                className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-9 px-5 font-semibold"
                            >
                                {running
                                    ? <><Loader2 size={14} className="mr-2 animate-spin" /> Téléversement…</>
                                    : <>Téléverser {ready.length} fichier{ready.length > 1 ? "s" : ""}</>}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
