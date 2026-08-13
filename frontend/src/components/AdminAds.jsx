import React, { useEffect, useState } from "react";
import { Megaphone, Save, Plus, Trash2, PlayCircle, LayoutPanelTop, ExternalLink, Heart } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMPTY_CAMPAIGN = {
    id: "", title: "", description: "", cta: "En savoir plus",
    advertiser: "", url: "", imageUrl: "", duration: 10, skipAfter: 5, enabled: true,
};

function Toggle({ checked, onChange, label }) {
    return (
        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#E8D2A6] w-4 h-4" />
            {label}
        </label>
    );
}

export default function AdminAds() {
    const [cfg, setCfg] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const r = await api.get("/admin/ads");
            setCfg(r.data);
        } catch (e) { showError(toast, e, "Chargement de la publicité impossible"); }
    };
    useEffect(() => { load(); }, []);

    const setPart = (part, patch) => setCfg((c) => ({ ...c, [part]: { ...c[part], ...patch } }));
    const setCampaign = (idx, patch) => setCfg((c) => ({
        ...c, campaigns: c.campaigns.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
    }));

    const save = async () => {
        setBusy(true);
        try {
            await api.post("/admin/ads", {
                enabled: cfg.enabled,
                preroll: cfg.preroll,
                banner: cfg.banner,
                popunder: cfg.popunder,
                gate: cfg.gate,
                reward: cfg.reward,
                campaigns: cfg.campaigns,
            });
            toast.success("Publicité enregistrée");
            load();
        } catch (e) { showError(toast, e, "Enregistrement impossible"); }
        finally { setBusy(false); }
    };

    if (!cfg) return <div className="text-neutral-500 text-sm">Chargement…</div>;

    return (
        <div className="space-y-8 max-w-4xl">
            <section className="p-6 rounded-2xl border border-[#E8D2A6]/30 bg-[#0c0c0c]">
                <div className="flex items-center gap-2 mb-1"><Megaphone size={18} className="text-[#E8D2A6]" /><h3 className="font-display text-xl">Régie publicitaire</h3></div>
                <p className="text-xs text-neutral-400 mb-4">
                    Interrupteur général. Les abonnés Premium ne voient jamais de publicité.
                    Colle ici les tags fournis par ta régie (Adsterra, HilltopAds, ExoClick…). URLs en https uniquement.
                </p>
                <Toggle checked={cfg.enabled} onChange={(v) => setCfg((c) => ({ ...c, enabled: v }))} label="Activer la publicité sur le site" />
            </section>

            <section className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><PlayCircle size={18} className="text-[#E8D2A6] shrink-0" /><h3 className="font-display text-xl">Pré-roll (avant la vidéo)</h3></div>
                <p className="text-xs text-neutral-500 mb-4">Tag VAST de la régie. Si vide ou sans réponse, les campagnes maison ci-dessous prennent le relais.</p>
                <Toggle checked={cfg.preroll.enabled} onChange={(v) => setPart("preroll", { enabled: v })} label="Activer le pré-roll" />
                <label className="block text-xs text-neutral-400 mt-4">Tag VAST (https)
                    <Input value={cfg.preroll.vast_tag_url} onChange={(e) => setPart("preroll", { vast_tag_url: e.target.value })} placeholder="https://…/vast?zone=123" className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                </label>
                <div className="grid sm:grid-cols-3 gap-3 mt-4">
                    <label className="text-xs text-neutral-400">Durée max (s)
                        <Input type="number" value={cfg.preroll.duration} onChange={(e) => setPart("preroll", { duration: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">Passable après (s)
                        <Input type="number" value={cfg.preroll.skip_after} onChange={(e) => setPart("preroll", { skip_after: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">1 pub toutes les (min)
                        <Input type="number" value={cfg.preroll.frequency_minutes} onChange={(e) => setPart("preroll", { frequency_minutes: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                </div>
            </section>

            <section className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><LayoutPanelTop size={18} className="text-[#E8D2A6] shrink-0" /><h3 className="font-display text-xl">Bannière</h3></div>
                <p className="text-xs text-neutral-500 mb-4">Affichée sur l'accueil et le catalogue, sous les carrousels.</p>
                <Toggle checked={cfg.banner.enabled} onChange={(v) => setPart("banner", { enabled: v })} label="Activer la bannière" />
                <label className="block text-xs text-neutral-400 mt-4">Script de la régie (https)
                    <Input value={cfg.banner.script_url} onChange={(e) => setPart("banner", { script_url: e.target.value })} placeholder="https://…/banner.js" className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                </label>
            </section>

            <section className="p-6 rounded-2xl border border-amber-500/30 bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><ExternalLink size={18} className="text-amber-400 shrink-0" /><h3 className="font-display text-xl">Popunder</h3></div>
                <p className="text-xs text-neutral-500 mb-4">
                    Format le plus rémunérateur mais le plus intrusif. Plafonné par visiteur, jamais sur la connexion ni l'admin.
                    Désactive-le si tu reçois des retours négatifs.
                </p>
                <Toggle checked={cfg.popunder.enabled} onChange={(v) => setPart("popunder", { enabled: v })} label="Activer le popunder" />
                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    <label className="text-xs text-neutral-400">Script de la régie (https)
                        <Input value={cfg.popunder.script_url} onChange={(e) => setPart("popunder", { script_url: e.target.value })} placeholder="https://…/pop.js" className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">1 fois toutes les (heures)
                        <Input type="number" value={cfg.popunder.frequency_hours} onChange={(e) => setPart("popunder", { frequency_hours: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                </div>
            </section>

            <section className="p-6 rounded-2xl border border-amber-500/30 bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><PlayCircle size={18} className="text-amber-400 shrink-0" /><h3 className="font-display text-xl">Porte avant lecture</h3></div>
                <p className="text-xs text-neutral-500 mb-4">
                    Bloque le lecteur tant que le visiteur n&apos;a pas validé les étapes ; chaque étape déclenche le popunder.
                    Nécessite un script popunder configuré ci-dessus. Ne jamais forcer le clic <em>sur la publicité</em> :
                    les régies ferment les comptes pour clic incité.
                </p>
                <Toggle checked={cfg.gate?.enabled} onChange={(v) => setPart("gate", { enabled: v })} label="Activer la porte avant lecture" />
                <label className="block text-xs text-neutral-400 mt-4">Direct Link de la régie (https) — ouvre une vraie page de pub à chaque étape
                    <Input value={cfg.gate?.direct_link || ""} onChange={(e) => setPart("gate", { direct_link: e.target.value })} placeholder="https://www.effectiveratecpm.com/…" className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                </label>
                <p className="text-[11px] text-neutral-600 mt-1.5">
                    À créer chez Adsterra : <span className="text-neutral-400">Direct Link</span> (aussi appelé Smart Link).
                    Sans lui, la porte se rabat sur le script popunder, qui n&apos;ouvre rien si le visiteur a un bloqueur.
                </p>
                <div className="grid sm:grid-cols-3 gap-3 mt-4">
                    <label className="text-xs text-neutral-400">Nombre d&apos;étapes (1 à 5)
                        <Input type="number" min="1" max="5" value={cfg.gate?.steps ?? 1} onChange={(e) => setPart("gate", { steps: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">Attente entre étapes (s)
                        <Input type="number" min="0" max="15" value={cfg.gate?.seconds ?? 3} onChange={(e) => setPart("gate", { seconds: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">Re-demander après (min) — 0 = à chaque film
                        <Input type="number" min="0" value={cfg.gate?.frequency_minutes ?? 60} onChange={(e) => setPart("gate", { frequency_minutes: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                </div>
            </section>

            <section className="p-6 rounded-2xl border border-emerald-500/25 bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-1"><Heart size={18} className="text-emerald-400 shrink-0" fill="currentColor" /><h3 className="font-display text-xl">Soutien gratuit (pub contre Freemium)</h3></div>
                <p className="text-xs text-neutral-500 mb-4">
                    Affiché dans Paramètres → Abonnement pour les non-Premium : le visiteur regarde une pub et gagne des Freemium.
                    Le quota et le délai limitent l&apos;abus (impossible de vérifier qu&apos;une pub a réellement été vue).
                </p>
                <Toggle checked={cfg.reward?.enabled} onChange={(v) => setPart("reward", { enabled: v })} label="Activer le soutien gratuit" />
                <div className="grid sm:grid-cols-4 gap-3 mt-4">
                    <label className="text-xs text-neutral-400">Freemium gagnés
                        <Input type="number" step="0.5" value={cfg.reward?.coins ?? 1} onChange={(e) => setPart("reward", { coins: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">Durée à patienter (s)
                        <Input type="number" value={cfg.reward?.watch_seconds ?? 20} onChange={(e) => setPart("reward", { watch_seconds: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">Délai entre 2 pubs (min)
                        <Input type="number" value={cfg.reward?.cooldown_minutes ?? 10} onChange={(e) => setPart("reward", { cooldown_minutes: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                    <label className="text-xs text-neutral-400">Max par jour
                        <Input type="number" value={cfg.reward?.daily_max ?? 10} onChange={(e) => setPart("reward", { daily_max: e.target.value })} className="mt-1 bg-[#111] border-[#262626] text-white h-9" />
                    </label>
                </div>
            </section>

            <section className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                <div className="flex items-center justify-between gap-3 mb-1">
                    <h3 className="font-display text-xl">Campagnes maison</h3>
                    <Button variant="outline" onClick={() => setCfg((c) => ({ ...c, campaigns: [...c.campaigns, { ...EMPTY_CAMPAIGN, id: `c${Date.now()}` }] }))} className="border-[#262626] bg-transparent text-white hover:bg-white/5 rounded-full h-9">
                        <Plus size={14} className="mr-1.5" /> Ajouter
                    </Button>
                </div>
                <p className="text-xs text-neutral-500 mb-4">Tes propres annonces (sponsors directs), utilisées quand la régie ne renvoie rien.</p>
                <div className="space-y-4">
                    {cfg.campaigns.length === 0 && <div className="text-sm text-neutral-600">Aucune campagne maison.</div>}
                    {cfg.campaigns.map((c, idx) => (
                        <div key={c.id || idx} className="p-4 rounded-xl border border-[#1a1a1a] bg-[#111] space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <Toggle checked={c.enabled !== false} onChange={(v) => setCampaign(idx, { enabled: v })} label="Active" />
                                <Button variant="ghost" size="icon" onClick={() => setCfg((x) => ({ ...x, campaigns: x.campaigns.filter((_, i) => i !== idx) }))} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></Button>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <label className="text-xs text-neutral-400">Titre
                                    <Input value={c.title} onChange={(e) => setCampaign(idx, { title: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                                </label>
                                <label className="text-xs text-neutral-400">Annonceur
                                    <Input value={c.advertiser} onChange={(e) => setCampaign(idx, { advertiser: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                                </label>
                                <label className="text-xs text-neutral-400">Lien (https)
                                    <Input value={c.url} onChange={(e) => setCampaign(idx, { url: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                                </label>
                                <label className="text-xs text-neutral-400">Image (https)
                                    <Input value={c.imageUrl} onChange={(e) => setCampaign(idx, { imageUrl: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                                </label>
                                <label className="text-xs text-neutral-400">Bouton
                                    <Input value={c.cta} onChange={(e) => setCampaign(idx, { cta: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="text-xs text-neutral-400">Durée (s)
                                        <Input type="number" value={c.duration} onChange={(e) => setCampaign(idx, { duration: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                                    </label>
                                    <label className="text-xs text-neutral-400">Passable (s)
                                        <Input type="number" value={c.skipAfter} onChange={(e) => setCampaign(idx, { skipAfter: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                                    </label>
                                </div>
                            </div>
                            <label className="block text-xs text-neutral-400">Description
                                <Input value={c.description} onChange={(e) => setCampaign(idx, { description: e.target.value })} className="mt-1 bg-[#0a0a0a] border-[#262626] text-white h-9" />
                            </label>
                        </div>
                    ))}
                </div>
            </section>

            <Button onClick={save} disabled={busy} data-testid="save-ads" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                <Save size={16} className="mr-2" /> {busy ? "Enregistrement…" : "Enregistrer la publicité"}
            </Button>
        </div>
    );
}
