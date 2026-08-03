import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { describeError, showError } from "@/lib/errors";

export default function LoginPage() {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);

    const doLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(email, password);
            toast.success("Connecté");
            navigate("/");
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
            await register(email, password, name);
            toast.success("Compte créé");
            navigate("/");
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
                    <div className="w-9 h-9 rounded-full border border-[#E8D2A6]/30 flex items-center justify-center">
                        <Film size={16} className="text-[#E8D2A6]" />
                    </div>
                    <span className="font-display text-xl">
                        YourMovie<span className="text-[#E8D2A6]">&apos;s</span>
                    </span>
                </Link>

                <h1 className="font-display text-4xl mb-2 tracking-tighter">Bienvenue</h1>
                <p className="text-neutral-400 mb-8">Connectez-vous ou créez un compte pour laisser des avis, garder vos favoris et une watchlist.</p>

                <Tabs defaultValue="login">
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
