import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowDown, ArrowUp, Upload, Plus, X, Save, Sparkles, Film, Tv, Loader2, Search, WandSparkles, GitBranch } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import * as tus from "tus-js-client";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useUploads } from "@/context/UploadContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    trailer_video_url: "",
    video_file_path: "",
    video_url: "",
    bunny_video_id: "",
    bunny_library_id: "",
    qualities: [],
    cast: "",
    director: "",
    country: "",
    rating: "",
    seasons: [],
    tmdb_id: null,
    tmdb_kind: null,
    saga_title: "",
    timeline: [],
    featured: false,
    in_theaters: false,
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

function MediaFlagControl({ checked, disabled, onToggle, label, testId }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={onToggle}
            disabled={disabled}
            data-testid={testId}
            className="group inline-flex min-w-[142px] items-center justify-end gap-3 rounded-full px-2 py-1.5 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6]/70 disabled:cursor-wait disabled:opacity-60"
        >
            <span className={`text-sm font-semibold ${checked ? "text-[#E8D2A6]" : "text-neutral-500"}`}>
                {disabled ? "Enregistrement…" : checked ? "Activé" : "Désactivé"}
            </span>
            <span
                aria-hidden="true"
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 ${checked ? "border-[#E8D2A6] bg-[#E8D2A6]" : "border-[#4a4a4a] bg-[#262626]"}`}
            >
                <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full shadow-md transition-transform duration-200 ${checked ? "translate-x-5 bg-black" : "translate-x-0 bg-white"}`}
                />
            </span>
        </button>
    );
}

export default function AdminMediaForm() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);
    const [form, setForm] = useState(EMPTY);
    const { uploads, beginUpload, updateUpload, completeUpload, failUpload, setUploadCancelHandler, activeUpload: findActiveUpload } = useUploads();
    const [uploadScope] = useState(() => {
        if (isEdit) return `media:${id}`;
        const storageKey = "yourmovies_admin_media_draft_scope";
        let scope = window.sessionStorage.getItem(storageKey);
        if (!scope) {
            scope = `draft:${Date.now()}:${Math.random().toString(36).slice(2)}`;
            window.sessionStorage.setItem(storageKey, scope);
        }
        return scope;
    });
    const scopedUploadKey = (key) => `${uploadScope}:${key}`;
    const activeUpload = (key) => findActiveUpload(scopedUploadKey(key));
    const [dragTrailer, setDragTrailer] = useState(false);
    const [dragBunny, setDragBunny] = useState(false);
    const uploadProgress = (key) => activeUpload(key)?.progress || 0;
    const uploadStage = (key) => activeUpload(key)?.stage || "";
    // L'enregistrement est bloqué uniquement pendant les quelques secondes avant
    // que Bunny fournisse une référence. Dès que videoId existe, le transfert peut
    // continuer globalement pendant que l'admin crée un autre contenu.
    const hasUploadWithoutReference = uploads.some((item) =>
        item.key?.startsWith(`${uploadScope}:`)
        && ["uploading", "cancelling"].includes(item.status)
        && !item.videoId
    );
    const [saving, setSaving] = useState(false);
    const [mediaFlagSaving, setMediaFlagSaving] = useState({});
    const [tmdbQuery, setTmdbQuery] = useState("");
    const [tmdbResults, setTmdbResults] = useState([]);
    const [tmdbSearching, setTmdbSearching] = useState(false);
    const [tmdbImporting, setTmdbImporting] = useState(null);
    const [timelineSuggesting, setTimelineSuggesting] = useState(false);

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
                    saga_title: m.saga_title || "",
                    timeline: m.timeline || [],
                    featured_order: m.featured_order ?? "",
                });
            } catch (e) { showError(toast, e, "Contenu introuvable"); }
        })();
    }, [id, isEdit]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!user.is_admin) return <Navigate to="/" replace />;

    const buildFileUrl = (p) => !p ? "" : (/^https?:\/\//.test(p) ? p : `${process.env.REACT_APP_BACKEND_URL}/api/files/${p}`);

    const uploadFile = async (file, kind, key, cb) => {
        const uploadId = beginUpload(file, scopedUploadKey(key), "Préparation");
        try {
            // 1. Signature sécurisée depuis notre backend
            const sigForm = new FormData();
            sigForm.append("kind", kind);
            const sig = await api.post("/upload/sign", sigForm);
            const { signature, timestamp, api_key, cloud_name, folder, resource_type } = sig.data;
            // 2. Upload DIRECT vers Cloudinary (sans passer par Render)
            const fd = new FormData();
            fd.append("file", file);
            fd.append("api_key", api_key);
            fd.append("timestamp", timestamp);
            fd.append("signature", signature);
            fd.append("folder", folder);
            const r = await axios.post(
                `https://api.cloudinary.com/v1_1/${cloud_name}/${resource_type}/upload`,
                fd,
                { onUploadProgress: (e) => { if (e.total) updateUpload(uploadId, { stage: "Envoi", progress: Math.round((e.loaded / e.total) * 100) }); } },
            );
            const url = r.data.secure_url;
            cb(url, url);
            completeUpload(uploadId);
            toast.success("Fichier téléversé");
        } catch (e) {
            failUpload(uploadId);
            showError(toast, e, "Téléversement impossible");
        }
    };

    const uploadToBunny = async (file, options = {}) => {
        const {
            key = "bunny",
            title = form.title || file.name,
            onReference = (reference) => setForm((f) => ({ ...f, ...reference })),
        } = options;
        const uploadId = beginUpload(file, scopedUploadKey(key), "Préparation Bunny");
        let cancelled = false;
        let tusUpload = null;
        try {
            const fd = new FormData();
            fd.append("title", title);
            const r = await api.post("/bunny/create-video", fd);
            const { videoId, libraryId, signature, expire } = r.data;
            const emptyReference = {
                bunny_video_id: "",
                bunny_library_id: "",
                video_url: "",
                video_file_path: "",
            };
            const reference = {
                bunny_video_id: videoId,
                bunny_library_id: String(libraryId),
                video_url: "",
                video_file_path: "",
            };
            onReference(reference);
            updateUpload(uploadId, {
                stage: "Envoi vers Bunny",
                progress: 0,
                videoId,
                libraryId: String(libraryId),
            });
            setUploadCancelHandler(uploadId, async () => {
                cancelled = true;
                if (tusUpload) {
                    try {
                        await tusUpload.abort(true);
                    } catch {
                        // Bunny sera quand même nettoyé par la route backend.
                    }
                }
                await api.delete(`/bunny/videos/${videoId}`, {
                    params: { library_id: String(libraryId) },
                });
                onReference(emptyReference);
            });
            await new Promise((resolve, reject) => {
                tusUpload = new tus.Upload(file, {
                    endpoint: "https://video.bunnycdn.com/tusupload",
                    retryDelays: [0, 3000, 5000, 10000, 20000],
                    headers: {
                        AuthorizationSignature: signature,
                        AuthorizationExpire: expire,
                        VideoId: videoId,
                        LibraryId: libraryId,
                    },
                    metadata: { filetype: file.type, title },
                    onError: reject,
                    onProgress: (loaded, total) => {
                        if (!cancelled) updateUpload(uploadId, { progress: Math.round((loaded / total) * 100) });
                    },
                    onSuccess: resolve,
                });
                tusUpload.start();
            });
            if (cancelled) return;
            if (isEdit && key === "bunny") {
                await api.put(`/media/${id}`, reference);
            }
            updateUpload(uploadId, { status: "checking", stage: "Encodage Bunny", progress: 0 });
            for (let i = 0; i < 200 && !cancelled; i++) {
                try {
                    const s = await api.get(`/bunny/video-status/${videoId}`, {
                        params: { library_id: String(libraryId) },
                    });
                    updateUpload(uploadId, { progress: s.data.encodeProgress || 0 });
                    if (s.data.status >= 4) break;
                } catch (error) {
                    const status = error?.response?.status;
                    if (status === 400 || status === 404) {
                        cancelled = true;
                        if (status === 404) onReference(emptyReference);
                        failUpload(
                            uploadId,
                            status === 404
                                ? "Supprimé depuis Bunny Stream — téléversement annulé"
                                : "Référence Bunny invalide — relance ce téléversement"
                        );
                        return;
                    }
                }
                await new Promise((res) => setTimeout(res, 3000));
            }
            if (cancelled) return;
            completeUpload(uploadId);
            toast.success("Vidéo prête");
        } catch (e) {
            if (cancelled) return;
            failUpload(uploadId);
            showError(toast, e, "Téléversement impossible");
        }
    };

    const toggleMediaFlag = async (field) => {
        if (mediaFlagSaving[field]) return;

        const previous = Boolean(form[field]);
        const value = !previous;
        setForm((current) => ({ ...current, [field]: value }));

        // Sur une création, les valeurs seront enregistrées avec le reste du formulaire.
        if (!isEdit) return;

        setMediaFlagSaving((current) => ({ ...current, [field]: true }));
        try {
            let response;
            try {
                response = await api.patch(`/admin/media/${id}/flags`, { [field]: value });
            } catch (requestError) {
                // Compatibilité pendant un éventuel déploiement décalé du backend.
                if (![404, 405].includes(requestError?.response?.status)) throw requestError;
                response = await api.put(`/media/${id}`, { [field]: value });
            }

            const persistedValue = response?.data?.[field];
            setForm((current) => ({
                ...current,
                [field]: typeof persistedValue === "boolean" ? persistedValue : value,
            }));
            toast.success(field === "featured"
                ? `À l’affiche ${value ? "activé" : "désactivé"}`
                : `Statut cinéma ${value ? "activé" : "désactivé"}`);
        } catch (error) {
            setForm((current) => ({ ...current, [field]: previous }));
            showError(toast, error, "Mise à jour impossible");
        } finally {
            setMediaFlagSaving((current) => ({ ...current, [field]: false }));
        }
    };

    const save = async () => {
        if (hasUploadWithoutReference) {
            toast.error("Patiente quelques secondes, le temps que Bunny crée la référence vidéo.");
            return;
        }
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
            trailer_video_url: form.trailer_video_url || null,
            title_logo_url: form.title_logo_url || null,
            age_rating: form.age_rating || null,
            video_file_path: form.video_file_path || null,
            video_url: form.video_url || null,
            bunny_video_id: form.bunny_video_id || null,
            bunny_library_id: form.bunny_library_id || null,
            qualities: (form.qualities || []).filter((q) => q.quality && (q.url || q.file_path)),
            cast: form.cast ? form.cast.split(",").map((s) => s.trim()).filter(Boolean) : [],
            director: form.director || null,
            country: form.country || null,
            rating: form.rating === "" || form.rating == null ? null : Number(form.rating),
            seasons: form.seasons || [],
            tmdb_id: form.tmdb_id || null,
            tmdb_kind: form.tmdb_kind || (form.type === "movie" ? "movie" : "tv"),
            saga_title: (form.saga_title || "").trim() || null,
            timeline: (form.timeline || []).map((item) => ({
                tmdb_id: item.tmdb_id || null,
                title: item.title?.trim() || "Titre inconnu",
                type: item.type || form.type,
                year: item.year === "" || item.year == null ? null : Number(item.year),
                release_date: item.release_date || null,
                poster_url: item.poster_url || null,
            })),
            featured: !!form.featured,
            in_theaters: !!form.in_theaters,
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
            if (!isEdit) {
                window.sessionStorage.removeItem("yourmovies_admin_media_draft_scope");
            }
            navigate("/admin?tab=media");
        } catch (e) {
            showError(toast, e, "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    };

    const searchTmdb = async () => {
        const query = tmdbQuery.trim();
        if (query.length < 2) {
            toast.error("Entre au moins 2 caractères");
            return;
        }
        setTmdbSearching(true);
        try {
            const r = await api.get("/admin/tmdb/search", { params: { q: query, kind: form.type } });
            setTmdbResults(r.data || []);
            if (!r.data?.length) toast.info("Aucun résultat trouvé");
        } catch (e) {
            showError(toast, e, "Recherche TMDB impossible");
        } finally {
            setTmdbSearching(false);
        }
    };

    const mergeImportedSeasons = (currentSeasons = [], importedSeasons = []) => {
        const existingSeasons = new Map(
            currentSeasons.map((season) => [Number(season.season_number), season]),
        );
        return importedSeasons.map((season) => {
            const existingSeason = existingSeasons.get(Number(season.season_number)) || {};
            const existingEpisodes = new Map(
                (existingSeason.episodes || []).map((episode) => [Number(episode.ep_number), episode]),
            );
            return {
                ...existingSeason,
                ...season,
                episodes: (season.episodes || []).map((episode) => {
                    const existingEpisode = existingEpisodes.get(Number(episode.ep_number)) || {};
                    return {
                        ...existingEpisode,
                        ...episode,
                        // Un nouvel import TMDB ne remplace jamais le fichier vidéo ajouté par l'admin.
                        video_url: existingEpisode.video_url || episode.video_url || "",
                        video_file_path: existingEpisode.video_file_path || episode.video_file_path || "",
                        bunny_video_id: existingEpisode.bunny_video_id || episode.bunny_video_id || "",
                        bunny_library_id: existingEpisode.bunny_library_id || episode.bunny_library_id || "",
                    };
                }),
            };
        });
    };

    const importTmdb = async (result) => {
        setTmdbImporting(result.tmdb_id);
        try {
            const r = await api.get(`/admin/tmdb/import/${result.media_type}/${result.tmdb_id}`, { params: { kind: form.type } });
            const data = r.data;
            setForm((current) => ({
                ...current,
                ...data,
                genres: (data.genres || []).join(", "),
                cast: (data.cast || []).join(", "),
                year: data.year ?? "",
                duration_minutes: data.duration_minutes ?? "",
                rating: data.rating ?? "",
                seasons: data.seasons?.length
                    ? mergeImportedSeasons(current.seasons || [], data.seasons)
                    : (current.seasons || []),
                saga_title: data.timeline?.length ? (data.saga_title || "") : current.saga_title,
                timeline: data.timeline?.length ? data.timeline : (current.timeline || []),
                // Ne jamais remplacer les vidéos déjà ajoutées au catalogue.
                video_file_path: current.video_file_path,
                video_url: current.video_url,
                bunny_video_id: current.bunny_video_id,
                bunny_library_id: current.bunny_library_id,
                qualities: current.qualities,
                trailer_video_url: current.trailer_video_url,
                featured: current.featured,
                featured_order: current.featured_order,
                in_theaters: current.in_theaters,
            }));
            setTmdbResults([]);
            toast.success("Informations importées depuis TMDB");
        } catch (e) {
            showError(toast, e, "Import TMDB impossible");
        } finally {
            setTmdbImporting(null);
        }
    };

    const suggestTimeline = async () => {
        if (!form.tmdb_id) {
            toast.info("Importe d’abord le titre avec l’assistant intelligent.");
            return;
        }
        const tmdbKind = form.tmdb_kind || (form.type === "movie" ? "movie" : "tv");
        setTimelineSuggesting(true);
        try {
            const r = await api.get(`/admin/tmdb/timeline/${tmdbKind}/${form.tmdb_id}`, {
                params: { kind: form.type },
            });
            const proposal = r.data || {};
            if (!proposal.timeline?.length) {
                toast.info("Aucune saga fiable n’a été trouvée automatiquement. Tu peux la créer manuellement.");
                return;
            }
            setForm((current) => ({
                ...current,
                saga_title: proposal.saga_title || current.saga_title,
                timeline: proposal.timeline,
            }));
            toast.success(`${proposal.timeline.length} titres proposés dans la chronologie`);
        } catch (e) {
            showError(toast, e, "Proposition de chronologie impossible");
        } finally {
            setTimelineSuggesting(false);
        }
    };

    const addTimelineItem = () => {
        setForm((current) => ({
            ...current,
            timeline: [
                ...(current.timeline || []),
                { tmdb_id: null, title: "", type: current.type, year: "", release_date: null, poster_url: null },
            ],
        }));
    };

    const updateTimelineItem = (index, patch) => {
        setForm((current) => ({
            ...current,
            timeline: (current.timeline || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        }));
    };

    const removeTimelineItem = (index) => {
        setForm((current) => ({
            ...current,
            timeline: (current.timeline || []).filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const moveTimelineItem = (index, direction) => {
        setForm((current) => {
            const timeline = [...(current.timeline || [])];
            const target = index + direction;
            if (target < 0 || target >= timeline.length) return current;
            [timeline[index], timeline[target]] = [timeline[target], timeline[index]];
            return { ...current, timeline };
        });
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
            eps.push({
                ep_number: eps.length + 1,
                title: "",
                duration: "",
                description: "",
                air_date: "",
                still_url: "",
                video_url: "",
                video_file_path: "",
            });
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
                    <Button onClick={save} disabled={!form.title || saving || hasUploadWithoutReference} data-testid="save-media-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                        <Save size={14} className="mr-2" /> {saving ? "..." : hasUploadWithoutReference ? "Préparation Bunny…" : "Enregistrer"}
                    </Button>
                </div>

                <div className="space-y-10">
                    {/* SECTION: Import intelligent TMDB */}
                    <section className="p-5 rounded-xl border border-[#E8D2A6]/30 bg-[#E8D2A6]/[0.04]">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-9 h-9 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center shrink-0">
                                <WandSparkles size={17} />
                            </div>
                            <div>
                                <h2 className="font-display text-xl text-[#E8D2A6]">Import intelligent</h2>
                                <p className="text-xs text-neutral-400 mt-1">Choisis Film, Série ou Anime, puis recherche le titre pour remplir automatiquement les informations, les visuels, le casting, la bande-annonce et, lorsqu’elle existe, sa saga.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3" data-testid="tmdb-kind-selector">
                            {[
                                { value: "movie", label: "Film", icon: Film },
                                { value: "series", label: "Série", icon: Tv },
                                { value: "anime", label: "Anime", icon: Sparkles },
                            ].map(({ value, label, icon: KindIcon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setForm((current) => current.type === value ? current : ({
                                            ...current,
                                            type: value,
                                            tmdb_id: null,
                                            tmdb_kind: null,
                                            saga_title: "",
                                            timeline: [],
                                        }));
                                        setTmdbResults([]);
                                    }}
                                    aria-pressed={form.type === value}
                                    className={`h-10 rounded-lg border flex items-center justify-center gap-2 text-sm font-medium transition-colors ${form.type === value ? "border-[#E8D2A6] bg-[#E8D2A6] text-black" : "border-[#262626] bg-[#111] text-neutral-300 hover:border-[#E8D2A6]/60"}`}
                                >
                                    <KindIcon size={15} />
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-neutral-500 mb-2">Recherche actuelle : <span className="text-[#E8D2A6]">{form.type === "movie" ? "Films" : form.type === "series" ? "Séries" : "Animes"}</span></p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                value={tmdbQuery}
                                onChange={(e) => setTmdbQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchTmdb(); } }}
                                placeholder={form.type === "movie" ? "Ex. Spider-Man: No Way Home" : "Ex. Stranger Things"}
                                data-testid="tmdb-search-input"
                                className="bg-[#111] border-[#262626] text-white flex-1"
                            />
                            <Button type="button" onClick={searchTmdb} disabled={tmdbSearching} data-testid="tmdb-search-button" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B]">
                                {tmdbSearching ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Search size={15} className="mr-2" />}
                                {tmdbSearching ? "Recherche..." : "Rechercher"}
                            </Button>
                        </div>
                        {tmdbResults.length > 0 && (
                            <div className="mt-4 grid gap-2 max-h-96 overflow-y-auto pr-1">
                                {tmdbResults.map((result) => (
                                    <button
                                        type="button"
                                        key={result.tmdb_id}
                                        onClick={() => importTmdb(result)}
                                        disabled={tmdbImporting != null}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#262626] bg-[#0a0a0a] hover:border-[#E8D2A6]/60 text-left transition-colors disabled:opacity-60"
                                    >
                                        {result.poster_url ? (
                                            <img src={result.poster_url} alt="" className="w-12 h-[72px] rounded object-cover bg-[#111] shrink-0" />
                                        ) : (
                                            <div className="w-12 h-[72px] rounded bg-[#111] shrink-0 flex items-center justify-center"><Film size={16} className="text-neutral-600" /></div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-white font-medium truncate">{result.title}</div>
                                            <div className="text-xs text-neutral-500 mt-1">{result.year || "Année inconnue"}{result.original_title && result.original_title !== result.title ? ` · ${result.original_title}` : ""}</div>
                                            {result.description && <div className="text-xs text-neutral-400 mt-1 line-clamp-2">{result.description}</div>}
                                        </div>
                                        {tmdbImporting === result.tmdb_id ? <Loader2 size={17} className="text-[#E8D2A6] animate-spin shrink-0" /> : <Plus size={17} className="text-[#E8D2A6] shrink-0" />}
                                    </button>
                                ))}
                            </div>
                        )}
                        <p className="text-[11px] text-neutral-600 mt-3">Données et images fournies par TMDB. Vérifie les informations avant d'enregistrer.</p>
                    </section>

                    {/* SECTION: Timeline / saga */}
                    <section className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5" data-testid="timeline-editor">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E8D2A6]/35 bg-[#E8D2A6]/10 text-[#E8D2A6]">
                                    <GitBranch size={17} />
                                </div>
                                <div>
                                    <h2 className="font-display text-xl text-[#E8D2A6]">Timeline, saga ou trilogie</h2>
                                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-400">
                                        L’assistant propose les œuvres liées dans l’ordre de sortie. Vérifie et réorganise la liste si l’ordre de visionnage est différent.
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={suggestTimeline}
                                disabled={timelineSuggesting || !form.tmdb_id}
                                data-testid="suggest-timeline-button"
                                className="shrink-0 rounded-full border-[#E8D2A6]/40 bg-[#E8D2A6]/5 text-[#E8D2A6] hover:bg-[#E8D2A6]/10 hover:text-[#E8D2A6]"
                            >
                                {timelineSuggesting ? <Loader2 size={14} className="mr-2 animate-spin" /> : <WandSparkles size={14} className="mr-2" />}
                                {timelineSuggesting ? "Analyse…" : "Proposer avec l’IA"}
                            </Button>
                        </div>

                        {!form.tmdb_id && (
                            <div className="mt-4 rounded-lg border border-dashed border-[#333] bg-[#111] px-4 py-3 text-xs text-neutral-500">
                                Sélectionne d’abord le bon résultat dans « Import intelligent » pour permettre à l’assistant d’identifier la saga.
                            </div>
                        )}

                        <div className="mt-5">
                            <Label className="text-neutral-300">Nom affiché sur la fiche</Label>
                            <Input
                                value={form.saga_title}
                                onChange={(e) => setForm((current) => ({ ...current, saga_title: e.target.value }))}
                                placeholder="Ex. La trilogie du Seigneur des Anneaux"
                                className="mt-1.5 border-[#262626] bg-[#111] text-white"
                                data-testid="timeline-title-input"
                            />
                        </div>

                        {(form.timeline || []).length > 0 ? (
                            <div className="mt-5 space-y-2">
                                {(form.timeline || []).map((item, index) => (
                                    <div key={`${item.tmdb_id || "manual"}-${index}`} className="grid grid-cols-[44px_minmax(0,1fr)_88px_auto] items-center gap-2 rounded-lg border border-[#262626] bg-[#111] p-2.5">
                                        <div className="relative h-16 w-11 overflow-hidden rounded-md border border-white/10 bg-[#161616]">
                                            {item.poster_url ? (
                                                <img src={item.poster_url} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-neutral-700"><Film size={14} /></div>
                                            )}
                                            <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E8D2A6] px-1 text-[10px] font-bold text-black">{index + 1}</span>
                                        </div>
                                        <div className="min-w-0 space-y-2">
                                            <Input
                                                value={item.title || ""}
                                                onChange={(e) => updateTimelineItem(index, { title: e.target.value })}
                                                placeholder="Titre de l’œuvre"
                                                className="h-9 border-[#2f2f2f] bg-[#0a0a0a] text-white"
                                                data-testid={`timeline-item-title-${index}`}
                                            />
                                            <Select value={item.type || form.type} onValueChange={(value) => updateTimelineItem(index, { type: value })}>
                                                <SelectTrigger className="h-8 border-[#2f2f2f] bg-[#0a0a0a] text-xs text-neutral-300"><SelectValue /></SelectTrigger>
                                                <SelectContent className="border-[#262626] bg-[#111] text-white">
                                                    <SelectItem value="movie">Film</SelectItem>
                                                    <SelectItem value="series">Série</SelectItem>
                                                    <SelectItem value="anime">Anime</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Input
                                            type="number"
                                            value={item.year ?? ""}
                                            onChange={(e) => updateTimelineItem(index, { year: e.target.value })}
                                            placeholder="Année"
                                            className="h-9 border-[#2f2f2f] bg-[#0a0a0a] text-white"
                                            aria-label={`Année du titre ${index + 1}`}
                                        />
                                        <div className="flex items-center gap-1">
                                            <Button type="button" variant="ghost" size="icon" onClick={() => moveTimelineItem(index, -1)} disabled={index === 0} className="h-8 w-8 text-neutral-400 hover:bg-white/5 hover:text-[#E8D2A6]" aria-label="Monter"><ArrowUp size={14} /></Button>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => moveTimelineItem(index, 1)} disabled={index === form.timeline.length - 1} className="h-8 w-8 text-neutral-400 hover:bg-white/5 hover:text-[#E8D2A6]" aria-label="Descendre"><ArrowDown size={14} /></Button>
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeTimelineItem(index)} className="h-8 w-8 text-neutral-500 hover:bg-red-500/10 hover:text-red-400" aria-label="Retirer"><X size={14} /></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-5 rounded-lg border border-dashed border-[#333] px-4 py-6 text-center text-sm text-neutral-500">
                                Aucune timeline renseignée. La section restera masquée sur la fiche média.
                            </div>
                        )}

                        <Button type="button" variant="ghost" size="sm" onClick={addTimelineItem} className="mt-3 text-[#E8D2A6] hover:bg-white/5 hover:text-[#E8D2A6]">
                            <Plus size={13} className="mr-1.5" /> Ajouter une œuvre manuellement
                        </Button>
                    </section>

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
                                <Select value={form.type} onValueChange={(v) => {
                                    setForm((current) => current.type === v ? current : ({
                                        ...current,
                                        type: v,
                                        tmdb_id: null,
                                        tmdb_kind: null,
                                        saga_title: "",
                                        timeline: [],
                                    }));
                                    setTmdbResults([]);
                                }}>
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
                                <div className="text-xs text-neutral-500 mt-1">Ratio 2:3 (vertical) — ex. 600×900 px — JPG ou WebP</div>
                                <div className="flex gap-2 mt-1.5">
                                    <Input value={form.poster_url} onChange={(e) => setForm({ ...form, poster_url: e.target.value })} placeholder="https://..." className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "image", "poster", (p) => setForm((f) => ({ ...f, poster_url: buildFileUrl(p) })))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300"><Upload size={14} /> {activeUpload("poster") ? "..." : "Upload"}</span>
                                    </label>
                                </div>
                                {form.poster_url && <img src={form.poster_url} alt="" className="mt-2 h-20 rounded" />}
                            </div>
                            <div>
                                <Label className="text-neutral-300">Bannière (URL ou upload)</Label>
                                <div className="text-xs text-neutral-500 mt-1">Paysage haute résolution — min. 1920×1080, idéal 2560×1440 px — sujet centré (recadrée pour remplir le hero, jamais déformée)</div>
                                <div className="flex gap-2 mt-1.5">
                                    <Input value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} placeholder="https://..." className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "image", "banner", (p) => setForm((f) => ({ ...f, banner_url: buildFileUrl(p) })))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300"><Upload size={14} /> {activeUpload("banner") ? "..." : "Upload"}</span>
                                    </label>
                                </div>
                            </div>
                            <div>
                                <Label className="text-neutral-300">Logo du titre (PNG transparent recommandé)</Label>
                                <div className="text-xs text-neutral-500 mt-1">PNG à fond transparent — paysage, ~800×320 px. <span className="text-neutral-400">S'il n'y a pas de logo, le <b>titre</b> (saisi en haut du formulaire) s'affiche automatiquement en texte.</span></div>
                                <div className="flex gap-2 mt-1.5">
                                    <Input data-testid="form-title-logo" value={form.title_logo_url} onChange={(e) => setForm({ ...form, title_logo_url: e.target.value })} placeholder="https://... (superposé au hero à la place du texte)" className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "image", "title_logo", (p) => setForm((f) => ({ ...f, title_logo_url: buildFileUrl(p) })))} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300"><Upload size={14} /> {activeUpload("title_logo") ? "..." : "Upload"}</span>
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
                                <Label className="text-neutral-300">Bande-annonce — fichier vidéo (glisser-déposer)</Label>
                                <label
                                    onDragOver={(e) => { e.preventDefault(); setDragTrailer(true); }}
                                    onDragLeave={() => setDragTrailer(false)}
                                    onDrop={(e) => { e.preventDefault(); setDragTrailer(false); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f, "video", "trailer", (p, url) => setForm((ff) => ({ ...ff, trailer_video_url: url }))); }}
                                    className={`mt-1.5 block rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${dragTrailer ? "border-[#E8D2A6] bg-[#E8D2A6]/5" : "border-[#262626] hover:border-[#E8D2A6]/50"}`}
                                >
                                    <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "video", "trailer", (p, url) => setForm((ff) => ({ ...ff, trailer_video_url: url })))} />
                                    {activeUpload("trailer") ? (
                                        <div className="flex items-center justify-center gap-2 text-[#E8D2A6]"><Loader2 size={18} className="animate-spin" /> {uploadProgress("trailer")}%</div>
                                    ) : form.trailer_video_url ? (
                                        <div className="text-sm text-[#E8D2A6]">✓ Vidéo ajoutée — glisse un autre fichier pour remplacer</div>
                                    ) : (
                                        <div className="text-sm text-neutral-400"><Upload size={16} className="inline mr-1.5" />Glisse un fichier vidéo ici, ou clique pour choisir</div>
                                    )}
                                </label>
                                {form.trailer_video_url && (
                                    <div className="flex items-center gap-3 mt-2">
                                        <video src={form.trailer_video_url} className="h-20 rounded border border-[#262626]" muted />
                                        <button type="button" onClick={() => setForm((f) => ({ ...f, trailer_video_url: "" }))} className="text-xs text-neutral-500 hover:text-red-400">Retirer</button>
                                    </div>
                                )}
                                <div className="text-xs text-neutral-500 mt-1">Si un fichier est présent, il est prioritaire sur YouTube pour la bande-annonce de l'accueil.</div>
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
                            <div className="flex items-center gap-2 mb-2">
                                <Film size={14} className="text-[#E8D2A6]" />
                                <span className="text-sm font-medium text-[#E8D2A6]">Vidéo principale</span>
                            </div>
                            <label
                                onDragOver={(e) => { e.preventDefault(); setDragBunny(true); }}
                                onDragLeave={() => setDragBunny(false)}
                                onDrop={(e) => { e.preventDefault(); setDragBunny(false); const f = e.dataTransfer.files?.[0]; if (f) uploadToBunny(f); }}
                                className={`block rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${dragBunny ? "border-[#E8D2A6] bg-[#E8D2A6]/5" : "border-[#262626] hover:border-[#E8D2A6]/50"}`}
                            >
                                <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadToBunny(e.target.files[0])} />
                                {activeUpload("bunny") ? (
                                    <div className="flex items-center justify-center gap-2 text-[#E8D2A6]"><Loader2 size={18} className="animate-spin" /> {uploadStage("bunny")} {uploadProgress("bunny")}%</div>
                                ) : form.bunny_video_id ? (
                                    <div className="text-sm text-[#E8D2A6]">✓ Vidéo ajoutée — glisse un autre fichier pour remplacer</div>
                                ) : (
                                    <div className="text-sm text-neutral-300"><Upload size={16} className="inline mr-1.5" />Glisse le fichier vidéo ici, ou clique pour choisir</div>
                                )}
                            </label>
                            {form.bunny_video_id && (
                                <button type="button" onClick={() => setForm((f) => ({ ...f, bunny_video_id: "", bunny_library_id: "" }))} className="mt-2 text-xs text-neutral-500 hover:text-red-400">Retirer la vidéo</button>
                            )}
                            <div className="text-xs text-neutral-500 mt-2">Streaming adaptatif automatique. Si présent, cette vidéo est prioritaire sur les champs ci-dessous.</div>
                        </div>

                        <div className="p-4 rounded-lg border border-[#262626] bg-[#0a0a0a] mb-6">
                            <Label className="text-neutral-300 text-xs">Vidéo par défaut (fallback si aucune qualité)</Label>
                            <div className="flex gap-2 mt-1.5">
                                <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="URL MP4/HLS externe" className="bg-[#111] border-[#262626] text-white flex-1" />
                                    <label className="cursor-pointer">
                                        <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadToBunny(e.target.files[0], { key: "default_video" })} />
                                        <span className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-sm text-neutral-300">{activeUpload("default_video") ? <><Loader2 size={14} className="animate-spin" /> {uploadProgress("default_video")}%</> : <><Upload size={14} /> Upload MP4</>}</span>
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
                                    Ajoutez plusieurs qualités — toutes accessibles à tous les utilisateurs (sans abonnement).
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
                                        <span className="inline-flex items-center gap-2 h-10 px-3 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-xs text-neutral-300">{activeUpload(`q${i}`) ? <><Loader2 size={12} className="animate-spin" /> {uploadProgress(`q${i}`)}%</> : <><Upload size={12} /> Upload</>}</span>
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
                            <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#262626]">
                                <div>
                                    <div className="text-white">Actuellement au cinéma</div>
                                    <div className="text-xs text-neutral-500">Avertit les spectateurs que la qualité disponible peut être réduite.</div>
                                </div>
                                <MediaFlagControl
                                    checked={!!form.in_theaters}
                                    disabled={!!mediaFlagSaving.in_theaters}
                                    onToggle={() => toggleMediaFlag("in_theaters")}
                                    testId="form-in-theaters"
                                    label="Activer ou désactiver le statut actuellement au cinéma"
                                />
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-white">À l&apos;affiche sur l&apos;accueil</div>
                                    <div className="text-xs text-neutral-500">Ce contenu apparaîtra dans le carrousel du hero (défilement auto).</div>
                                </div>
                                <MediaFlagControl
                                    checked={!!form.featured}
                                    disabled={!!mediaFlagSaving.featured}
                                    onToggle={() => toggleMediaFlag("featured")}
                                    testId="form-featured"
                                    label="Activer ou désactiver la mise à l'affiche"
                                />
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
                                            {(s.episodes || []).map((ep, j) => {
                                                const episodeKey = `episode:${s.season_number || i + 1}:${ep.ep_number || j + 1}`;
                                                return (
                                                    <div key={ep.tmdb_id || j} className="rounded-lg border border-[#222] bg-[#080808] p-3 space-y-3">
                                                        <div className="flex items-center gap-2">
                                                            {ep.still_url && <img src={ep.still_url} alt="" className="w-24 h-14 rounded object-cover shrink-0" />}
                                                            <Input type="number" value={ep.ep_number} onChange={(e) => updateEpisode(i, j, { ep_number: Number(e.target.value) })} className="w-20 bg-[#0a0a0a] border-[#262626] text-white" placeholder="Ep" />
                                                            <Input value={ep.title || ""} onChange={(e) => updateEpisode(i, j, { title: e.target.value })} className="bg-[#0a0a0a] border-[#262626] text-white flex-1" placeholder="Nom de l'épisode" />
                                                            <Input type="number" value={ep.duration || ""} onChange={(e) => updateEpisode(i, j, { duration: Number(e.target.value) })} className="w-24 bg-[#0a0a0a] border-[#262626] text-white" placeholder="min" />
                                                            <Button variant="ghost" size="icon" onClick={() => removeEpisode(i, j)} className="text-neutral-400 hover:text-red-400"><X size={12} /></Button>
                                                        </div>
                                                        <Textarea
                                                            value={ep.description || ""}
                                                            onChange={(e) => updateEpisode(i, j, { description: e.target.value })}
                                                            className="bg-[#0a0a0a] border-[#262626] text-white min-h-16"
                                                            placeholder="Synopsis de l'épisode"
                                                        />
                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            <Input
                                                                value={ep.video_url || ""}
                                                                onChange={(e) => updateEpisode(i, j, { video_url: e.target.value })}
                                                                className="bg-[#0a0a0a] border-[#262626] text-white flex-1"
                                                                placeholder="URL du fichier MP4 de cet épisode"
                                                            />
                                                            <label className="cursor-pointer shrink-0">
                                                                <input
                                                                    type="file"
                                                                    accept="video/mp4,video/webm,video/quicktime"
                                                                    className="hidden"
                                                                    onChange={(e) => e.target.files?.[0] && uploadToBunny(
                                                                        e.target.files[0],
                                                                        {
                                                                            key: episodeKey,
                                                                            title: `${form.title || "Épisode"} — S${s.season_number || i + 1}E${ep.ep_number || j + 1}`,
                                                                            onReference: (reference) => updateEpisode(i, j, reference),
                                                                        },
                                                                    )}
                                                                />
                                                                <span className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md border border-[#262626] hover:border-[#E8D2A6]/50 text-xs text-neutral-300">
                                                                    {activeUpload(episodeKey)
                                                                        ? <><Loader2 size={12} className="animate-spin" /> {uploadProgress(episodeKey)}%</>
                                                                        : <><Upload size={12} /> Ajouter le MP4</>}
                                                                </span>
                                                            </label>
                                                        </div>
                                                        {ep.air_date && <div className="text-[11px] text-neutral-600">Diffusé le {ep.air_date}</div>}
                                                    </div>
                                                );
                                            })}
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
                    <Button onClick={save} disabled={!form.title || saving || hasUploadWithoutReference} data-testid="save-media-btn-bottom" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">
                        <Save size={14} className="mr-2" /> {saving ? "..." : hasUploadWithoutReference ? "Téléversement en cours…" : "Enregistrer"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
