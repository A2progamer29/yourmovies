import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, Plus, X, Save, Sparkles, Film, Tv } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Header from "@/components/Header";
import { showError } from "@/lib/errors";

const EMPTY = {
    title: "",
    description: "",
    type: "movie",
    year: "",
    duration_minutes: "",
    genres: "",
    poster_url: "",
    banner_url: "",
    title_logo_url: "",
    age_rating: "",
    trailer_youtube_id: "",
    video_file_path: "",
    video_url: "",
    qualities: [],
    cast: "",
    director: "",
    country: "",
    seasons: [],
    featured: false,
    featured_order: "",
};

const QUALITY_OPTIONS = ["4k", "1080p", "720p", "480p"];

function parseYouTubeId(input) {
    if (!input) return "";
    const s = input.trim();
    if (s.length <= 15 && !s.includes("/") && !s.includes(".")) return s;
    try {
        const url = new URL(s);
        if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "");
        return url.searchParams.get("v") || "";
    } catch { return s; }
}

export default function AdminMediaForm() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);
    const [form, setForm] = useState(EMPTY);
    const [uploading, setUploading] = useState(null); // key currently uploading
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isEdit) return;
        (async () => {
            try {
                const r = await api.get(`/media/${id}`);
                const m = r.data;
                setForm({
                    ...EMPTY,
                    ...m,
                    year: m.year ?? "",
                    duration_minutes: m.duration_minutes ?? "",
                    genres: (m.genres || []).join(", "),
                    cast: (m.cast || []).join(", "),
                    seasons: m.seasons || [],
                    qualities: m.qualities || [],
                    featured_order: m.featured_order ?? "",
                });
            } catch (e) { showError(toast, e, "Contenu introuvable"); }
        })();
    }, [id, isEdit]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!user.is_admin) return <Navigate to="/" replace />;

    const buildFileUrl = (path) => path ? `${process.env.REACT_APP_BACKEND_URL}/api/files/${path}` : "";

    const uploadFile = async (file, kind, key, cb) => {
        setUploading(key);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("kind", kind);
            const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            cb(r.data.path, buildFileUrl(r.data.path));
            toast.success("Fichier téléversé");
        } catch (e) {
            showError(toast, e, "Téléversement impossible");
        } finally {
            setUploading(null);
        }
    };

    const save = async () => {
        const payload = {
            title: form.title,
            description: form.description,
            type: form.type,
            year: form.year ? Number(form.year) : null,
            duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
            genres: form.genres ? form.genres.split(",").map((s) => s.trim()).filter(Boolean) : [],
            poster_url: form.poster_url || null,
            banner_url: form.banner_url || null,
            trailer_youtube_id: parseYouTubeId(form.trailer_youtube_id) || null,
            title_logo_url: form.title_logo_url || null,
            age_rating: form.age_rating || null,
            video_file_path: form.video_file_path || null,
            video_url: form.video_url || null,
            qualities: (form.qualities || []).filter((q) => q.quality && (q.url || q.file_path)),
            cast: form.cast ? form.cast.split(",").map((s) => s.trim()).filter(Boolean) : [],
            director: form.director || null,
            country: form.country || null,
            seasons: form.seasons || [],
            featured: !!form.featured,
            featured_order: form.featured_order === "" ? null : Number(form.featured_order),
        };
        setSaving(true);
        try {
            if (isEdit) {
                await api.put(`/media/${id}`, payload);
                toast.success("Contenu mis à jour");
            } else {
                await api.post("/media", payload);
                toast.success("Contenu créé");
            }
            navigate("/admin?tab=media");
        } catch (e) {
            showError(toast, e, "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    };

    // Qualities helpers
    const addQuality = () => {
        const used = new Set((form.qualities || []).map((q) => q.quality));
        const next = QUALITY_OPTIONS.find((q) => !used.has(q)) || "720p";
        setForm({ ...form, qualities: [...(form.qualities || []), { quality: next, url: "", file_path: "" }] });
    };
    const updateQuality = (i, patch) => {
        const arr = [...(form.qualities || [])];
        arr[i] = { ...arr[i], ...patch };
        setForm({ ...form, qualities: arr });
    };
    const removeQuality = (i) => {
        setForm({ ...form, qualities: form.qualities.filter((_, idx) => idx !== i) });
    };

    // Season helpers (kept from AdminPage)
    const addSeason = () => {
        setForm((f) => ({ ...f, seasons: [...(f.seasons || []), { season_number: (f.seasons?.length || 0) + 1, title: "", episodes: [] }] }));
    };
    const updateSeason = (i, patch) => {
        setForm((f) => {
            const seasons = [...(f.seasons || [])];
            seasons[i] = { ...seasons[i], ...patch };
            return { ...f, seasons };
        });
    };
    const removeSeason = (i) => {
        setForm((f) => ({ ...f, seasons: f.seasons.filter((_, idx) => idx !== i) }));
    };
    const addEpisode = (i) => {
        setForm((f) => {
            const seasons = [...(f.seasons || [])];
            const eps = [...(seasons[i].episodes || [])];
            eps.push({ ep_number: eps.length + 1, title: "", duration: "" });
            seasons[i] = { ...seasons[i], episodes: eps };
            return { ...f, seasons };
        });
    };
    const updateEpisode = (i, j, patch) => {
        setForm((f) => {
            const seasons = [...(f.seasons || [])];
            const eps = [...(seasons[i].episodes || [])];
            eps[j] = { ...eps[j], ...patch };
            seasons[i] = { ...seasons[i], episodes: eps };
            return { ...f, seasons };
        });
    };
    const removeEpisode = (i, j) => {
        setForm((f) => {
            const seasons = [...(f.seasons || [])];
            const eps = seasons[i].episodes.filter((_, idx) => idx !== j);
            seasons[i] = { ...seasons[i], episodes: eps };
            return { ...f, seasons };
        });
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-5xl mx-auto px-6 py-10">
                <button
                    onClick={() => navigate("/admin?tab=media")}
                    className="flex items-center gap-1 text-neutral-400 hover:text-[#E8D2A6] transition-colors mb-6"
                    data-testid="admin-back-btn"
                >
                    <ArrowLeft size={16} /> Retour au catalogue
                </button>

                <div className="flex items-end justify-between gap-4 mb-10">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Admin · Contenu</div>
                        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">
                            {isEdit ? "Modifier" : "Nouveau contenu"}
                        </h1>
                    </div>
                    <Button onClick={save} disabled={!form.title || saving} data-testid="save-media-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                        <Save size={14} className="mr-2" /> {saving ? "..." : "Enregistrer"}
                    </Button>
                </div>

                <div className="space-y-10">
                    {/* SECTION: Informations générales */}
                    <section>
                        <h2 className="font-display text-xl mb-4 flex items-center gap-2 text-[#E8D2A6]"><Sparkles size={16} /> Informations générales</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <Label className="text-neutral-300">Titre *</Label>
                                <Input data-testid="form-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-neutral-300">Type *</Label>
                                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                                    <SelectTrigger data-testid="form-type" className="bg-[#111] border-[#262626] text-white mt-1.5"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-[#111] border-[#262626] text-white">
                                        <SelectItem value="movie">Film</SelectItem>
                                        <SelectItem value="series">Série</SelectItem>
                                        <SelectItem value="anime">Anime</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-neutral-300">Année</Label>
                                <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-neutral-300">Durée (min)</Label>
                                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-neutral-300">Pays</Label>
                                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                            <div className="md:col-span-2">
                                <Label className="text-neutral-300">Description</Label>
                                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5 min-h-[120px]" />
                            </div>
                            <div className="md:col-span-2">
                                <Label className="text-neutral-300">Genres (séparés par virgules)</Label>
                                <Input value={form.genres} onChange={(e) => setForm({ ...form, genres: e.target.value })} placeholder="Action, Sci-Fi" className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-neutral-300">Réalisateur</Label>
                                <Input value={form.director} onChange={(e) => setForm({ ...form, director: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-neutral-300">Casting (séparés par virgules)</Label>
                                <Input value={form.cast} onChange={(e) => setForm({ ...form, cast: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                        </div>
                    </section>

                    {/* SECTION: Visuels */}
                    <section>
                        <h2 className="font-display text-xl mb-4 flex items-center gap-2 text-[#E8D2A6]"><Film size={16} /> Visuels & bande-annonce</h2>
                        <div className="space-y-4">
                            <div>
                                <Label className="text-neutral-300">Poster (URL ou upload)</Label>
                                <div className="flex gap-2 mt-1.5">
                                    <Input value={form.poster_url} onChange={(e) => setForm({ ...form, poster_url: e.target.value })} placeholder="https://..." className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "image", "poster", (p) => setForm((f) => ({ ...f, poster_url: buildFileUrl(p) })))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300"><Upload size={14} /> {uploading === "poster" ? "..." : "Upload"}</span>
                                    </label>
                                </div>
                                {form.poster_url && <img src={form.poster_url} alt="" className="mt-2 h-20 rounded" />}
                            </div>
                            <div>
                                <Label className="text-neutral-300">Bannière (URL ou upload)</Label>
                                <div className="flex gap-2 mt-1.5">
                                    <Input value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} placeholder="https://..." className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "image", "banner", (p) => setForm((f) => ({ ...f, banner_url: buildFileUrl(p) })))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300"><Upload size={14} /> {uploading === "banner" ? "..." : "Upload"}</span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <Label className="text-neutral-300">Logo du titre (PNG transparent recommandé)</Label>
                                <div className="flex gap-2 mt-1.5">
                                    <Input data-testid="form-title-logo" value={form.title_logo_url} onChange={(e) => setForm({ ...form, title_logo_url: e.target.value })} placeholder="https://... (superposé au hero à la place du texte)" className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "image", "title_logo", (p) => setForm((f) => ({ ...f, title_logo_url: buildFileUrl(p) })))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300"><Upload size={14} /> {uploading === "title_logo" ? "..." : "Upload"}</span>
                                    </label>
                                </div>
                                {form.title_logo_url && (
                                    <div className="mt-2 p-3 rounded bg-black inline-block">
                                        <img src={form.title_logo_url} alt="" className="h-16 object-contain" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <Label className="text-neutral-300">Bande-annonce YouTube (ID ou URL)</Label>
                                <Input value={form.trailer_youtube_id} onChange={(e) => setForm({ ...form, trailer_youtube_id: e.target.value })} placeholder="dQw4w9WgXcQ ou https://youtu.be/..." className="bg-[#111] border-[#262626] text-white mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-neutral-300">Classification d&apos;âge</Label>
                                <Select value={form.age_rating || "none"} onValueChange={(v) => setForm({ ...form, age_rating: v === "none" ? "" : v })}>
                                    <SelectTrigger data-testid="form-age-rating" className="bg-[#111] border-[#262626] text-white mt-1.5 max-w-xs"><SelectValue placeholder="Aucune" /></SelectTrigger>
                                    <SelectContent className="bg-[#111] border-[#262626] text-white">
                                        <SelectItem value="none">Non renseigné</SelectItem>
                                        <SelectItem value="0">Tous publics</SelectItem>
                                        <SelectItem value="6">6+</SelectItem>
                                        <SelectItem value="10">10+</SelectItem>
                                        <SelectItem value="12">12+</SelectItem>
                                        <SelectItem value="16">16+</SelectItem>
                                        <SelectItem value="18">18+</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="text-xs text-neutral-500 mt-1">Utilisé pour le filtrage des profils enfants.</div>
                            </div>
                        </div>
                    </section>

                    {/* SECTION: Vidéo & qualités */}
                    <section>
                        <h2 className="font-display text-xl mb-4 flex items-center gap-2 text-[#E8D2A6]"><Film size={16} /> Vidéo & qualités multiples</h2>
                        <div className="p-4 rounded-lg border border-[#262626] bg-[#0a0a0a] mb-6">
                            <Label className="text-neutral-300 text-xs">Vidéo par défaut (fallback si aucune qualité)</Label>
                            <div className="flex gap-2 mt-1.5">
                                <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="URL MP4/HLS externe" className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "video", "default_video", (p, url) => setForm((f) => ({ ...f, video_file_path: p, video_url: f.video_url || url })))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300"><Upload size={14} /> {uploading === "default_video" ? "..." : "Upload MP4"}</span>
                                    </label>
                            </div>
                            {form.video_file_path && <div className="text-xs text-neutral-500 mt-1.5">Fichier: {form.video_file_path}</div>}
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm text-neutral-300">Qualités disponibles</div>
                            <Button variant="outline" size="sm" onClick={addQuality} data-testid="add-quality-btn" className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full">
                                <Plus size={12} className="mr-1" /> Ajouter une qualité
                            </Button>
                        </div>
                        <div className="space-y-3">
                            {(form.qualities || []).length === 0 && (
                                <div className="text-xs text-neutral-500 p-3 rounded border border-dashed border-[#262626]">
                                    Ajoutez plusieurs qualités (720p pour tous, 1080p à partir de Basic, 4K en Premium).
                                </div>
                            )}
                            {(form.qualities || []).map((q, i) => (
                                <div key={i} className="flex items-center gap-2 p-3 rounded-lg border border-[#262626] bg-[#0a0a0a]" data-testid={`quality-row-${i}`}>
                                    <Select value={q.quality} onValueChange={(v) => updateQuality(i, { quality: v })}>
                                        <SelectTrigger className="w-32 bg-[#111] border-[#262626] text-white"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-[#111] border-[#262626] text-white">
                                            {QUALITY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o.toUpperCase()}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Input value={q.url || ""} onChange={(e) => updateQuality(i, { url: e.target.value })} placeholder="URL MP4/HLS" className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "video", `q${i}`, (p) => updateQuality(i, { url: buildFileUrl(p), file_path: p }))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-xs text-neutral-300"><Upload size={12} /> {uploading === `q${i}` ? "..." : "Upload"}</span>
                                    </label>
                                    <Button variant="ghost" size="icon" onClick={() => removeQuality(i)} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><X size={14} /></Button>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* SECTION: À l'affiche */}
                    <section>
                        <h2 className="font-display text-xl mb-4 flex items-center gap-2 text-[#E8D2A6]"><Sparkles size={16} /> Mise en avant</h2>
                        <div className="p-4 rounded-lg border border-[#262626] bg-[#0a0a0a] space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-white">À l&apos;affiche sur l&apos;accueil</div>
                                    <div className="text-xs text-neutral-500">Ce contenu apparaîtra dans le carrousel du hero (défilement auto).</div>
                                </div>
                                <Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} data-testid="form-featured" />
                            </div>
                            {form.featured && (
                                <div>
                                    <Label className="text-neutral-300">Ordre d&apos;affichage (plus petit = plus tôt)</Label>
                                    <Input type="number" value={form.featured_order} onChange={(e) => setForm({ ...form, featured_order: e.target.value })} placeholder="0" data-testid="form-featured-order" className="bg-[#111] border-[#262626] text-white mt-1.5 max-w-xs" />
                                </div>
                            )}
                        </div>
                    </section>

                    {/* SECTION: Saisons */}
                    {form.type !== "movie" && (
                        <section>
                            <h2 className="font-display text-xl mb-4 flex items-center gap-2 text-[#E8D2A6]"><Tv size={16} /> Saisons & épisodes</h2>
                            <div className="flex justify-end mb-3">
                                <Button variant="outline" size="sm" onClick={addSeason} className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full">
                                    <Plus size={12} className="mr-1" /> Ajouter saison
                                </Button>
                            </div>
                            <div className="space-y-4">
                                {(form.seasons || []).map((s, i) => (
                                    <div key={i} className="border border-[#262626] rounded-md p-4">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Input type="number" value={s.season_number} onChange={(e) => updateSeason(i, { season_number: Number(e.target.value) })} className="w-24 bg-[#111] border-[#262626] text-white" placeholder="N°" />
                                            <Input value={s.title || ""} onChange={(e) => updateSeason(i, { title: e.target.value })} className="bg-[#111] border-[#262626] text-white flex-1" placeholder="Titre saison (optionnel)" />
                                            <Button variant="ghost" size="icon" onClick={() => removeSeason(i)} className="text-red-400 hover:bg-white/5"><X size={14} /></Button>
                                        </div>
                                        <div className="space-y-2">
                                            {(s.episodes || []).map((ep, j) => (
                                                <div key={j} className="flex items-center gap-2">
                                                    <Input type="number" value={ep.ep_number} onChange={(e) => updateEpisode(i, j, { ep_number: Number(e.target.value) })} className="w-20 bg-[#0a0a0a] border-[#262626] text-white" placeholder="Ep" />
                                                    <Input value={ep.title || ""} onChange={(e) => updateEpisode(i, j, { title: e.target.value })} className="bg-[#0a0a0a] border-[#262626] text-white flex-1" placeholder="Titre" />
                                                    <Input type="number" value={ep.duration || ""} onChange={(e) => updateEpisode(i, j, { duration: Number(e.target.value) })} className="w-24 bg-[#0a0a0a] border-[#262626] text-white" placeholder="min" />
                                                    <Button variant="ghost" size="icon" onClick={() => removeEpisode(i, j)} className="text-neutral-400 hover:text-red-400"><X size={12} /></Button>
                                                </div>
                                            ))}
                                            <Button variant="ghost" size="sm" onClick={() => addEpisode(i)} className="text-[#E8D2A6] hover:bg-white/5">
                                                <Plus size={12} className="mr-1" /> Ajouter épisode
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                <div className="mt-12 flex justify-end gap-2 border-t border-[#262626] pt-6">
                    <Button variant="outline" onClick={() => navigate("/admin?tab=media")} className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full">Annuler</Button>
                    <Button onClick={save} disabled={!form.title || saving} data-testid="save-media-btn-bottom" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">
                        <Save size={14} className="mr-2" /> {saving ? "..." : "Enregistrer"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
