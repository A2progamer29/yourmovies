import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ecrirePass, lirePass } from "@/lib/playbackPass";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let chargement;

function chargerScript() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    if (chargement) return chargement;
    chargement = new Promise((resolve, reject) => {
        const balise = document.createElement("script");
        let timer;
        const fail = () => { window.clearTimeout(timer); balise.remove(); reject(new Error("Cloudflare indisponible")); };
        balise.src = SCRIPT;
        balise.async = true;
        balise.defer = true;
        balise.addEventListener("load", () => {
            window.clearTimeout(timer);
            if (window.turnstile?.render) resolve(window.turnstile);
            else fail();
        }, { once: true });
        balise.addEventListener("error", fail, { once: true });
        timer = window.setTimeout(fail, 15000);
        document.head.appendChild(balise);
    }).catch(error => { chargement = null; throw error; });
    return chargement;
}

export default function TurnstileGate({ onVerified, access }) {
    const conteneur = useRef(null);
    const callback = useRef(onVerified);
    const [etat, setEtat] = useState("chargement");
    const [erreur, setErreur] = useState("");
    const [code, setCode] = useState("");
    const [tentative, setTentative] = useState(0);
    useEffect(() => { callback.current = onVerified; }, [onVerified]);

    useEffect(() => {
        let active = true;
        let widget = null;
        let turnstile;
        let envoi = false;
        const fail = (message, errorCode = "") => {
            if (!active) return;
            setErreur(message); setCode(String(errorCode)); setEtat("erreur");
        };
        setEtat("chargement"); setErreur(""); setCode("");
        (async () => {
            // Une nouvelle autorisation exige une nouvelle preuve après ses pubs.
            if (!access && lirePass()) { callback.current(); return; }
            try {
                const { data: config } = await api.get("/playback/verification", { silent: true });
                if (!active) return;
                if (!access && config?.required === false) { callback.current(); return; }
                if (!config?.site_key) { fail("Vérification non configurée. Contactez le support."); return; }
                turnstile = await chargerScript();
                if (!active || !conteneur.current) return;
                setEtat("pret");
                widget = turnstile.render(conteneur.current, {
                    sitekey: config.site_key, theme: "dark", size: conteneur.current.clientWidth < 300 ? "compact" : "flexible",
                    action: "playback", ...(access?.captcha_context ? { cData: access.captcha_context } : {}),
                    callback: async (token) => {
                        if (!active || envoi) return;
                        envoi = true; setEtat("envoi");
                        try {
                            const { data } = await api.post("/playback/verify", { token }, {
                                silent: true, ...(access ? { headers: { "X-Playback-Grant": access.grant } } : {}),
                            });
                            if (!active) return;
                            if (!data?.ok || (!access && !data?.pass)) throw new Error("Réponse de vérification invalide.");
                            if (!access) ecrirePass(data.pass);
                            callback.current();
                        } catch (error) {
                            fail(error?.response?.data?.detail || "La vérification n'a pas abouti. Réessayez.");
                        } finally { envoi = false; }
                    },
                    "error-callback": value => { fail("Cloudflare n'a pas pu terminer la vérification.", value); return true; },
                    "expired-callback": () => fail("La vérification a expiré. Réessayez."),
                    "timeout-callback": () => fail("Le délai de vérification est dépassé. Réessayez."),
                });
            } catch { fail("Impossible de charger Cloudflare. Vérifiez votre connexion, puis réessayez."); }
        })();
        return () => {
            active = false;
            if (widget !== null) { try { turnstile?.remove(widget); } catch { } }
        };
    }, [access, tentative]);

    return (
        <div className="flex min-h-[350px] flex-col items-center justify-center gap-4 bg-[#050505] px-4 py-8 text-center" data-testid="turnstile-gate">
            <ShieldCheck size={24} className="text-[#E8D2A6]" />
            <div>
                <div className="font-display text-xl text-white sm:text-2xl">Dernière étape avant la lecture</div>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-neutral-400">
                    Confirme que tu n&apos;es pas un robot avec Cloudflare pour lancer la vidéo.
                </p>
            </div>
            <div ref={conteneur} className="min-h-[65px] w-full max-w-[320px]" />
            {(etat === "chargement" || etat === "envoi") && <div role="status" className="flex items-center gap-2 text-xs text-[#E8D2A6]"><Loader2 size={13} className="animate-spin" />{etat === "envoi" ? "Vérification…" : "Préparation de Cloudflare…"}</div>}
            {etat === "erreur" && <div className="flex max-w-sm flex-col items-center gap-3">
                <p role="alert" className="text-xs text-red-400">{erreur}{code ? ` (Code ${code})` : ""}</p>
                <Button onClick={() => setTentative(value => value + 1)} data-testid="turnstile-retry" className="h-10 rounded-full bg-[#E8D2A6] px-5 text-xs font-semibold text-black hover:bg-[#D4BB8B]"><RotateCcw size={13} className="mr-1.5" />Réessayer</Button>
            </div>}
            <p className="text-[11px] text-neutral-500">La vidéo démarre après validation.</p>
        </div>
    );
}
