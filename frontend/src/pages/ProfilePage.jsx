import React, { useEffect, useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Header from "@/components/Header";
import MediaCard from "@/components/MediaCard";

export default function ProfilePage() {
    const { user, loading } = useAuth();
    const [items, setItems] = useState([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get("tab") || "favorites";

    useEffect(() => {
        if (!user) return;
        (async () => {
            const r = await api.get("/favorites");
            setItems(r.data);
        })();
    }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    const favorites = items.filter((i) => i.list_type === "favorite");
    const watchlist = items.filter((i) => i.list_type === "watchlist");

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <section className="relative isolate min-h-[280px] overflow-hidden border-b border-[#262626]">
                {user.banner ? (
                    <img src={user.banner} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
                ) : (
                    <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_20%,rgba(232,210,166,0.16),transparent_38%),linear-gradient(135deg,#17130d_0%,#050505_58%,#101010_100%)]" />
                )}
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#050505] via-transparent to-black/30" />
                <div className="mx-auto flex min-h-[280px] max-w-7xl items-end px-6 pb-10 pt-20">
                <div className="flex items-center gap-5">
                    {user.picture ? (
                        <img src={user.picture} alt={user.name} className="w-16 h-16 rounded-full" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-2xl font-semibold">
                            {user.name?.[0]?.toUpperCase()}
                        </div>
                    )}
                    <div>
                        <div className="text-xs uppercase tracking-widest text-neutral-500">Profil</div>
                        <h1 className="font-display text-3xl tracking-tighter" data-testid="profile-name">{user.name}</h1>
                        <div className="text-sm text-neutral-500">{user.email}</div>
                    </div>
                </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-6 py-10">
                <Tabs value={tab} onValueChange={(v) => { const n = new URLSearchParams(searchParams); n.set("tab", v); setSearchParams(n); }}>
                    <TabsList className="bg-[#111] border border-[#262626]">
                        <TabsTrigger value="favorites" data-testid="tab-favorites" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">Favoris ({favorites.length})</TabsTrigger>
                        <TabsTrigger value="watchlist" data-testid="tab-watchlist" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">Watchlist ({watchlist.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="favorites" className="mt-8">
                        {favorites.length === 0 ? (
                            <div className="text-neutral-500">Aucun favori pour le moment.</div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                {favorites.map((m) => <MediaCard key={m.id} media={m} size="sm" />)}
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="watchlist" className="mt-8">
                        {watchlist.length === 0 ? (
                            <div className="text-neutral-500">Votre watchlist est vide.</div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                {watchlist.map((m) => <MediaCard key={m.id} media={m} size="sm" />)}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

