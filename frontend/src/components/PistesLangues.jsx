import React from "react";
import { Loader2, Upload, Plus, Trash2, Languages } from "lucide-react";
import { Input } from "@/components/ui/input";
import VerifierVideo from "@/components/VerifierVideo";

const SUGGESTIONS = ["VO", "VOSTFR", "Bande originale", "VF", "Anglais", "Japonais"];

/** Pistes supplémentaires d'un titre ou d'un épisode : version originale, autre
 *  doublage. Même principe que la piste principale — un libellé, un fichier
 *  déposé chez l'hébergeur, et sa vérification juste en dessous. */
export default function PistesLangues({
    pistes = [],
    onChange,
    uploadToBunny,
    activeUpload,
    uploadProgress,
    clePrefixe,
    titreMedia,
    compact = false,
}) {
    const modifier = (index, champs) => {
        onChange(pistes.map((piste, i) => (i === index ? { ...piste, ...champs } : piste)));
    };

    const ajouter = () => {
        const restantes = SUGGESTIONS.filter((s) => !pistes.some((p) => p.label === s));
        onChange([...pistes, { label: restantes[0] || "", bunny_video_id: "", bunny_library_id: "" }]);
    };

    const retirer = (index) => onChange(pistes.filter((_, i) => i !== index));

    return (
        <div className={compact ? "mt-2" : "mt-4"} data-testid={`pistes-${clePrefixe}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                <Languages size={12} className="text-[#E8D2A6]" />
                Autres pistes
                {pistes.length > 0 && <span className="text-neutral-600">· {pistes.length}</span>}
            </div>

            {pistes.map((piste, index) => {
                const cle = `${clePrefixe}:piste${index}`;
                const aFichier = Boolean(piste.bunny_video_id);
                return (
                    <div key={cle} className="mt-2 rounded-lg border border-[#262626] bg-[#0a0a0a] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                value={piste.label || ""}
                                onChange={(e) => modifier(index, { label: e.target.value.slice(0, 40) })}
                                placeholder="VO, VOSTFR, Anglais…"
                                data-testid={`piste-label-${cle}`}
                                className="h-9 w-32 border-[#262626] bg-[#111] text-sm text-white"
                            />

                            <label className="cursor-pointer">
                                <input
                                    type="file"
                                    accept="video/mp4,video/webm,video/quicktime"
                                    className="hidden"
                                    onChange={(e) => e.target.files?.[0] && uploadToBunny(e.target.files[0], {
                                        key: cle,
                                        precedent: { bunny_video_id: piste.bunny_video_id, bunny_library_id: piste.bunny_library_id },
                                        title: `${titreMedia || "Piste"} — ${piste.label || "autre piste"}`,
                                        onReference: (reference) => modifier(index, reference),
                                    })}
                                />
                                <span
                                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs transition-colors ${aFichier
                                        ? "border-[#E8D2A6]/45 bg-[#E8D2A6]/[0.06] text-[#E8D2A6] hover:border-[#E8D2A6]/75"
                                        : "border-[#262626] text-neutral-300 hover:border-[#E8D2A6]/50"}`}
                                >
                                    {activeUpload(cle)
                                        ? <><Loader2 size={12} className="animate-spin" /> {uploadProgress(cle)}%</>
                                        : <><Upload size={12} /> {aFichier ? "Remplacer le fichier" : "Ajouter le MP4"}</>}
                                </span>
                            </label>

                            <button
                                type="button"
                                onClick={() => retirer(index)}
                                aria-label="Retirer cette piste"
                                data-testid={`piste-retirer-${cle}`}
                                className="ml-auto rounded p-1.5 text-neutral-500 transition-colors hover:bg-white/5 hover:text-red-400"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        {aFichier && (
                            <VerifierVideo videoId={piste.bunny_video_id} libraryId={piste.bunny_library_id} compact />
                        )}
                        {!piste.label && (
                            <div className="mt-2 text-[11px] text-amber-300">
                                Sans libellé, cette piste ne pourra pas être proposée au spectateur.
                            </div>
                        )}
                    </div>
                );
            })}

            <button
                type="button"
                onClick={ajouter}
                data-testid={`piste-ajouter-${clePrefixe}`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#262626] px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-[#E8D2A6]/50 hover:text-white"
            >
                <Plus size={12} /> Ajouter une piste
            </button>
        </div>
    );
}
