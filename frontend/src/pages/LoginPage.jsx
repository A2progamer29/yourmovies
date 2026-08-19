import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { describeError, showError } from "@/lib/errors";
import { api } from "@/lib/api";
import { refCodeCourant, enregistrerRef } from "@/lib/referral";
import { Gift } from "lucide-react";

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function LoginPage() {
    const { login, register, loginWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    /** Un compte pouvant avoir plusieurs profils arrive sur leur choix, sauf s'il
     *  a demandé à ne plus le voir. Sans profils, la question ne se pose pas. */
    const apresConnexion = useCallback((compte) => {
        const choixUtile = compte?.premium && !compte?.skip_profile_picker;
        navigate(choixUtile ? "/profiles" : "/");
    }, [navigate]);
    const [parrainage, setParrainage] = useState(null);
    const [codeParrain, setCodeParrain] = useState(() => refCodeCourant());
    // Un code arrivé par lien vaut invitation : on le dit plutôt que de le
    // laisser agir en silence.
    const [invite] = useState(() => Boolean(refCodeCourant()));

    useEffect(() => {
        api.get("/referral/config", { silent: true })
            .then((r) => setParrainage(r.data?.enabled ? r.data : null))
            .catch(() => setParrainage(null));
    }, []);
    // Connexion Google par redirection pleine page (aucun popup).
    const startGoogleLogin = () => {
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: window.location.origin + "/login",
            response_type: "id_token",
            scope: "openid email profile",
            nonce,
            prompt: "select_account",
        });
        window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
    };

    // Au retour de Google, l'id_token est dans le fragment d'URL (#id_token=...).
    useEffect(() => {
        if (!GOOGLE_CLIENT_ID) return;
        const frag = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
        const idToken = frag ? new URLSearchParams(frag).get("id_token") : null;
        if (!idToken) return;
        window.history.replaceState(null, "", window.location.pathname);
        (async () => {
            try {
                apresConnexion(await loginWithGoogle(idToken));
                toast.success("Connecté");
            } catch (err) {
                showError(toast, err, "Connexion Google impossible");
            }
        })();
    }, [loginWithGoogle, apresConnexion]);

    const doLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            apresConnexion(await login(email, password));
            toast.success("Connecté");
        } catch (err) {
            showError(toast, err, "Connexion impossible");
        } finally {
            setLoading(false);
        }
    };

    const doRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const cree = await register(email, password, name);
            apresConnexion(cree);
            toast.success("Compte créé");
        } catch (err) {
            showError(toast, err, "Inscription impossible");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            <div className="noise-overlay" />
            <div className="max-w-md w-full mx-auto px-6 py-16 flex-1 flex flex-col justify-center">
                <Link to="/" className="flex items-center gap-2 mb-10">
                    <img src="/logo.png" alt="YourMovie's" className="w-9 h-9 rounded-full object-cover" />
                    <span className="font-display text-xl">
                        YourMovie<span className="text-[#E8D2A6]">&apos;s</span>
                    </span>
                </Link>

                <h1 className="font-display text-4xl mb-2 tracking-tighter">Bienvenue</h1>
                <p className="text-neutral-400 mb-8">Connectez-vous ou créez un compte pour laisser des avis, garder vos favoris et une watchlist.</p>

                {GOOGLE_CLIENT_ID && (
                    <>
                        <button
                            type="button"
                            onClick={startGoogleLogin}
                            data-testid="google-login-btn"
                            className="w-full flex items-center justify-center gap-2 h-11 rounded-full bg-white text-black hover:bg-neutral-200 font-medium mb-2"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Continuer avec Google
                        </button>
                        <div className="flex items-center gap-3 my-6">
                            <div className="flex-1 h-px bg-[#262626]" />
                            <span className="text-xs uppercase tracking-widest text-neutral-500">Ou</span>
                            <div className="flex-1 h-px bg-[#262626]" />
                        </div>
                    </>
                )}

                {parrainage && (
                    <div
                        data-testid="parrainage-annonce"
                        className="mb-6 flex gap-3 rounded-2xl border border-[#E8D2A6]/30 bg-[#0c0c0c] p-4"
                    >
                        <Gift size={18} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                        <div className="min-w-0 text-sm leading-relaxed text-neutral-300">
                            {invite ? (
                                <>
                                    <span className="text-white">Tu as été invité.</span> En créant ton
                                    compte, tu reçois {parrainage.coins_filleul} Freemium, et la personne
                                    qui t&apos;a invité en reçoit {parrainage.coins_parrain}.
                                </>
                            ) : (
                                <>
                                    <span className="text-white">Quelqu&apos;un t&apos;a parrainé ?</span> Renseigne
                                    son code à l&apos;inscription : tu repars avec {parrainage.coins_filleul} Freemium,
                                    et lui {parrainage.coins_parrain}. Une fois inscrit, tu auras ton propre code à
                                    partager.
                                </>
                            )}
                        </div>
                    </div>
                )}

                <Tabs defaultValue={invite ? "register" : "login"}>
                    <TabsList className="grid grid-cols-2 bg-[#111] border border-[#262626]">
                        <TabsTrigger value="login" data-testid="tab-login" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">Connexion</TabsTrigger>
                        <TabsTrigger value="register" data-testid="tab-register" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">Inscription</TabsTrigger>
                    </TabsList>
                    <TabsContent value="login" className="mt-6">
                        <form onSubmit={doLogin} className="space-y-4">
                            <div>
                                <Label htmlFor="email" className="text-neutral-300">Email</Label>
                                <Input id="email" data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#111] border-[#262626] text-white mt-1.5 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]" />
                            </div>
                            <div>
                                <Label htmlFor="password" className="text-neutral-300">Mot de passe</Label>
                                <Input id="password" data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-[#111] border-[#262626] text-white mt-1.5 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]" />
                            </div>
                            <Button type="submit" disabled={loading} data-testid="submit-login-btn" className="w-full bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 font-semibold">
                                {loading ? "..." : "Se connecter"}
                            </Button>
                        </form>
                    </TabsContent>
                    <TabsContent value="register" className="mt-6">
                        <form onSubmit={doRegister} className="space-y-4">
                            <div>
                                <Label htmlFor="rname" className="text-neutral-300">Nom</Label>
                                <Input id="rname" data-testid="register-name" required value={name} onChange={(e) => setName(e.target.value)} className="bg-[#111] border-[#262626] text-white mt-1.5 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]" />
                            </div>
                            <div>
                                <Label htmlFor="remail" className="text-neutral-300">Email</Label>
                                <Input id="remail" data-testid="register-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#111] border-[#262626] text-white mt-1.5 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]" />
                            </div>
                            <div>
                                <Label htmlFor="rpassword" className="text-neutral-300">Mot de passe</Label>
                                <Input id="rpassword" data-testid="register-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-[#111] border-[#262626] text-white mt-1.5 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]" />
                            </div>
                            {parrainage && (
                                <div>
                                    <Label htmlFor="rref" className="flex items-center gap-2 text-neutral-300">
                                        Code de parrainage
                                        <span className="text-xs text-neutral-500">facultatif</span>
                                    </Label>
                                    <Input
                                        id="rref"
                                        data-testid="register-ref"
                                        value={codeParrain}
                                        onChange={(e) => setCodeParrain(enregistrerRef(e.target.value))}
                                        placeholder="Le code de la personne qui t'a invité"
                                        className="mt-1.5 bg-[#111] border-[#262626] uppercase text-white focus-visible:border-[#E8D2A6] focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50"
                                    />
                                    {codeParrain && (
                                        <div className="mt-1.5 text-xs text-[#E8D2A6]">
                                            {parrainage.coins_filleul} Freemium te seront crédités à la création du compte.
                                        </div>
                                    )}
                                </div>
                            )}

                            <Button type="submit" disabled={loading} data-testid="submit-register-btn" className="w-full bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 font-semibold">
                                {loading ? "..." : "Créer mon compte"}
                            </Button>
                        </form>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
