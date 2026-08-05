import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Search, User, Users, LogOut, Settings, Heart, Crown, Sliders, Coins, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationsBell from "@/components/NotificationsBell";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
    { to: "/", label: "Accueil" },
    { to: "/browse?type=movie", label: "Films" },
    { to: "/browse?type=series", label: "Séries" },
    { to: "/browse?type=anime", label: "Animes" },
    { to: "/wishboard", label: "Wishboard" },
    { to: "/coins", label: "YM Coins" },
    { to: "/pricing", label: "Premium" },
];

export default function Header() {
    const { user, logout, activeProfile, selectProfile } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQ, setSearchQ] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [userResults, setUserResults] = useState([]);

    useEffect(() => {
        if (!searchOpen) return;
        const q = searchQ.trim();
        if (!q) { setSearchResults([]); setUserResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const r = await api.get(`/media?q=${encodeURIComponent(q)}&limit=8`, { silent: true });
                setSearchResults(r.data || []);
            } catch { setSearchResults([]); }
            if (user) {
                try {
                    const u = await api.get(`/users/search?q=${encodeURIComponent(q)}`, { silent: true });
                    setUserResults(u.data || []);
                } catch { setUserResults([]); }
            }
        }, 250);
        return () => clearTimeout(t);
    }, [searchQ, searchOpen, user]);

    useEffect(() => {
        if (!searchOpen) return;
        const onKey = (e) => { if (e.key === "Escape") setSearchOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [searchOpen]);

    const openSearch = () => { setSearchQ(""); setSearchResults([]); setUserResults([]); setSearchOpen(true); };

    const isActive = (to) => {
        if (to === "/") return location.pathname === "/";
        const [path, q] = to.split("?");
        if (location.pathname !== path) return false;
        if (q) {
            const key = q.split("=")[0];
            const val = q.split("=")[1];
            return new URLSearchParams(location.search).get(key) === val;
        }
        return true;
    };

    return (
        <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[#050505]/70 border-b border-white/5">
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
                <Link to="/" data-testid="header-logo" className="flex items-center gap-2 group">
                    <img src="/logo.png" alt="YourMovie's" className="w-9 h-9 rounded-full object-cover" />
                    <span className="font-display text-xl tracking-tight text-white">
                        YourMovie<span className="text-[#E8D2A6]">&apos;s</span>
                    </span>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    {links.map((l) => (
                        <Link
                            key={l.to}
                            to={l.to}
                            data-testid={`nav-${l.label.toLowerCase()}`}
                            className={`px-4 py-2 rounded-full text-sm transition-colors ${isActive(l.to)
                                ? "text-[#E8D2A6] bg-white/5"
                                : "text-neutral-300 hover:text-white hover:bg-white/5"
                                }`}
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-neutral-300 hover:text-[#E8D2A6] hover:bg-white/5"
                        onClick={openSearch}
                        data-testid="header-search-btn"
                        aria-label="Rechercher"
                    >
                        <Search size={18} />
                    </Button>

                    {user && <NotificationsBell />}

                    {user ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    data-testid="header-user-menu"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#262626] hover:border-[#E8D2A6]/50 transition-colors focus-ring"
                                >
                                    {activeProfile ? (
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm" style={{ background: activeProfile.color }}>
                                            {activeProfile.emoji}
                                        </div>
                                    ) : user.picture ? (
                                        <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-xs font-semibold">
                                            {user.name?.[0]?.toUpperCase() || "U"}
                                        </div>
                                    )}
                                    <span className="text-sm text-white hidden sm:block">{activeProfile ? activeProfile.name : user.name}</span>
                                    {user.premium && <Crown size={12} className="text-[#E8D2A6]" />}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-[#111111] border-[#262626] text-white" align="end">
                                <DropdownMenuLabel className="text-neutral-400">
                                    {user.email}
                                </DropdownMenuLabel>
                                {activeProfile && (
                                    <div className="px-2 pb-1 text-xs text-[#E8D2A6] flex items-center gap-1.5">
                                        <span>{activeProfile.emoji}</span> Profil actif : {activeProfile.name}
                                    </div>
                                )}
                                <DropdownMenuSeparator className="bg-[#262626]" />
                                <DropdownMenuItem
                                    onClick={() => navigate("/profile")}
                                    data-testid="menu-profile"
                                    className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                >
                                    <User size={14} className="mr-2" /> Mon profil
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => navigate("/profile?tab=favorites")}
                                    data-testid="menu-favorites"
                                    className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                >
                                    <Heart size={14} className="mr-2" /> Favoris & Watchlist
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => navigate("/coins")}
                                    data-testid="menu-coins"
                                    className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                >
                                    <Coins size={14} className="mr-2" /> YM Coins
                                    {typeof user.coins === "number" && <span className="ml-auto text-[#E8D2A6] font-semibold">{user.coins}</span>}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => navigate("/pricing")}
                                    data-testid="menu-pricing"
                                    className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                >
                                    <Crown size={14} className="mr-2" /> {user.premium ? "Mon abonnement" : "Passer Premium"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => navigate("/profiles")}
                                    data-testid="menu-profiles"
                                    className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                >
                                    <Users size={14} className="mr-2" /> Changer de profil
                                </DropdownMenuItem>
                                {activeProfile && (
                                    <DropdownMenuItem
                                        onClick={() => { selectProfile(null); navigate("/"); }}
                                        data-testid="menu-profile-general"
                                        className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                    >
                                        <User size={14} className="mr-2" /> Profil général (compte)
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    onClick={() => navigate("/settings")}
                                    data-testid="menu-settings"
                                    className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                >
                                    <Sliders size={14} className="mr-2" /> Paramètres
                                </DropdownMenuItem>
                                {user.is_admin && (
                                    <DropdownMenuItem
                                        onClick={() => navigate("/admin")}
                                        data-testid="menu-admin"
                                        className="focus:bg-white/5 focus:text-[#E8D2A6] cursor-pointer"
                                    >
                                        <Settings size={14} className="mr-2" /> Panneau admin
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator className="bg-[#262626]" />
                                <DropdownMenuItem
                                    onClick={logout}
                                    data-testid="menu-logout"
                                    className="focus:bg-white/5 focus:text-red-400 cursor-pointer"
                                >
                                    <LogOut size={14} className="mr-2" /> Déconnexion
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button
                            onClick={() => navigate("/login")}
                            data-testid="header-login-btn"
                            className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold"
                        >
                            Connexion
                        </Button>
                    )}
                </div>
            </div>

            {searchOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
                    onClick={() => setSearchOpen(false)}
                >
                    <div
                        className="w-full max-w-xl bg-[#0a0a0a] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262626]">
                            <Search size={18} className="text-[#E8D2A6]" />
                            <input
                                autoFocus
                                value={searchQ}
                                onChange={(e) => setSearchQ(e.target.value)}
                                data-testid="search-input"
                                placeholder="Rechercher un film, une série, un anime…"
                                className="flex-1 bg-transparent outline-none text-white placeholder:text-neutral-500"
                            />
                            <button onClick={() => setSearchOpen(false)} className="text-neutral-500 hover:text-white"><X size={18} /></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            {searchResults.length === 0 && userResults.length === 0 ? (
                                <div className="px-4 py-10 text-center text-sm text-neutral-500">
                                    {searchQ.trim() ? "Aucun résultat" : "Tape pour rechercher…"}
                                </div>
                            ) : (
                                <>
                                    {userResults.length > 0 && (
                                        <>
                                            <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-neutral-500">Utilisateurs</div>
                                            {userResults.map((u) => (
                                                <button
                                                    key={u.user_id}
                                                    onClick={() => { setSearchOpen(false); navigate(`/u/${u.user_id}`); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors"
                                                >
                                                    {u.picture
                                                        ? <img src={u.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                                                        : <div className="w-8 h-8 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-xs font-semibold shrink-0">{u.name?.[0]?.toUpperCase() || "U"}</div>}
                                                    <div className="text-sm text-white truncate">{u.name}</div>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                    {searchResults.length > 0 && (
                                        <>
                                            <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-neutral-500">Titres</div>
                                            {searchResults.map((m) => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => { setSearchOpen(false); navigate(`/media/${m.id}`); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors"
                                                >
                                                    {m.poster_url
                                                        ? <img src={m.poster_url} alt="" className="w-9 h-12 object-cover rounded bg-[#111] shrink-0" />
                                                        : <div className="w-9 h-12 rounded bg-[#111] shrink-0" />}
                                                    <div className="min-w-0">
                                                        <div className="text-sm text-white truncate">{m.title}</div>
                                                        <div className="text-xs text-neutral-500 capitalize">{m.type}{m.year ? ` · ${m.year}` : ""}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
