import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { UploadProvider } from "@/context/UploadContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import Splash from "@/components/Splash";
import HomePage from "@/pages/HomePage";
import BrowsePage from "@/pages/BrowsePage";
import MediaDetailPage from "@/pages/MediaDetailPage";
import WatchPage from "@/pages/WatchPage";
import LoginPage from "@/pages/LoginPage";
import ProfilePage from "@/pages/ProfilePage";
import AdminPage from "@/pages/AdminPage";
import AdminMediaForm from "@/pages/AdminMediaForm";
import AdminUserPage from "@/pages/AdminUserPage";
import AuthCallback from "@/pages/AuthCallback";
import PricingPage from "@/pages/PricingPage";
import SubscriptionPage from "@/pages/SubscriptionPage";
import ProfilesPage from "@/pages/ProfilesPage";
import SettingsPage from "@/pages/SettingsPage";
import WishboardPage from "@/pages/WishboardPage";
import CoinsPage from "@/pages/CoinsPage";
import CagnottePage from "@/pages/CagnottePage";
import PublicProfilePage from "@/pages/PublicProfilePage";
import MessagesPage from "@/pages/MessagesPage";
import ConversationPage from "@/pages/ConversationPage";
import AboutPage from "@/pages/AboutPage";
import TermsPage from "@/pages/TermsPage";
import PrivacyPage from "@/pages/PrivacyPage";
import DmcaPage from "@/pages/DmcaPage";
import Footer from "@/components/Footer";
import BetaNoticeDialog from "@/components/BetaNoticeDialog";
import VersionChecker from "@/components/VersionChecker";
import GlobalUploadManager from "@/components/GlobalUploadManager";
import DiscordInvitePopup from "@/components/DiscordInvitePopup";
import PopUnder from "@/components/PopUnder";
import VisitTracker from "@/components/VisitTracker";

function ScrollToTop() {
    const { pathname } = useLocation();

    React.useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, [pathname]);

    return null;
}

function AppRouter() {
    const location = useLocation();
    if (location.hash?.includes("session_id=")) {
        return <AuthCallback />;
    }
    const p = location.pathname;
    const noFooter = p.startsWith("/watch/") || p.startsWith("/messages") || p.startsWith("/login")
        || p.startsWith("/admin") || p === "/about" || p === "/cgu" || p === "/politique" || p === "/dmca";
    return (
        <>
        <ScrollToTop />
        <main key={location.pathname} className="ym-page-enter">
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/media/:id" element={<MediaDetailPage />} />
            <Route path="/watch/:id" element={<WatchPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/wishboard" element={<WishboardPage />} />
            <Route path="/coins" element={<CoinsPage />} />
            <Route path="/cagnotte" element={<CagnottePage />} />
            <Route path="/u/:id" element={<PublicProfilePage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:id" element={<ConversationPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/cgu" element={<TermsPage />} />
            <Route path="/politique" element={<PrivacyPage />} />
            <Route path="/dmca" element={<DmcaPage />} />
            <Route path="/account/subscription" element={<SubscriptionPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/media/new" element={<AdminMediaForm />} />
            <Route path="/admin/media/:id/edit" element={<AdminMediaForm />} />
            <Route path="/admin/users/:id" element={<AdminUserPage />} />
            <Route path="/pricing" element={<PricingPage />} />
        </Routes>
        </main>
        {!noFooter && <Footer />}
        </>
    );
}

function App() {
    return (
        <div className="App">
            <Splash />
            <BrowserRouter>
                <ErrorBoundary>
                    <AuthProvider>
                        <UploadProvider>
                            <FavoritesProvider>
                                <AppRouter />
                                <PopUnder />
                                <VisitTracker />
                                <GlobalUploadManager />
                                <VersionChecker />
                                <BetaNoticeDialog />
                                <DiscordInvitePopup />
                                <Toaster theme="dark" richColors position="top-right" />
                            </FavoritesProvider>
                        </UploadProvider>
                    </AuthProvider>
                </ErrorBoundary>
            </BrowserRouter>
        </div>
    );
}

export default App;
