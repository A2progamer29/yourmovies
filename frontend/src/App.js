import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { OfflineDownloadsProvider } from "@/context/OfflineDownloadsContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { UploadProvider } from "@/context/UploadContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import Splash from "@/components/Splash";
import EtatConnexion from "@/components/EtatConnexion";
import HomePage from "@/pages/HomePage";
import BrowsePage from "@/pages/BrowsePage";
import MediaDetailPage from "@/pages/MediaDetailPage";
import WatchPage from "@/pages/WatchPage";
import OfflineWatchPage from "@/pages/OfflineWatchPage";
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
import ReferralPage from "@/pages/ReferralPage";
import NotFoundPage from "@/pages/NotFoundPage";
import { captureRef } from "@/lib/referral";
import SupportBanner from "@/components/SupportBanner";
import PollsPage from "@/pages/PollsPage";
import CoinsPage from "@/pages/CoinsPage";
import CagnottePage from "@/pages/CagnottePage";
import PublicProfilePage from "@/pages/PublicProfilePage";
import MessagesPage from "@/pages/MessagesPage";
import ConversationPage from "@/pages/ConversationPage";
import AboutPage from "@/pages/AboutPage";
import TermsPage from "@/pages/TermsPage";
import PrivacyPage from "@/pages/PrivacyPage";
import DmcaPage from "@/pages/DmcaPage";
import DocsPage from "@/pages/DocsPage";
import Footer from "@/components/Footer";
import BetaNoticeDialog from "@/components/BetaNoticeDialog";
import VersionChecker from "@/components/VersionChecker";
import GlobalUploadManager from "@/components/GlobalUploadManager";
import DiscordInvitePopup from "@/components/DiscordInvitePopup";
import AideChargement from "@/components/AideChargement";
import VisitTracker from "@/components/VisitTracker";
import SettingsTabsRuntimeFix from "@/components/SettingsTabsRuntimeFix";

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
    const noFooter = p.startsWith("/watch/") || p.startsWith("/offline/") || p.startsWith("/messages") || p.startsWith("/login")
        || p.startsWith("/admin") || p === "/about" || p === "/cgu" || p === "/politique" || p === "/dmca" || p === "/documentation";
    return (
        <>
        <SupportBanner />
        <ScrollToTop />
        <SettingsTabsRuntimeFix />
        <main key={location.pathname} className="ym-page-enter">
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/browse" element={<BrowsePage />} />
            <Route path="/media/:id" element={<MediaDetailPage />} />
            <Route path="/watch/:id" element={<WatchPage />} />
            <Route path="/offline/:downloadId" element={<OfflineWatchPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/wishboard" element={<WishboardPage />} />
            <Route path="/sondages" element={<PollsPage />} />
            <Route path="/parrainage" element={<ReferralPage />} />
            <Route path="/coins" element={<CoinsPage />} />
            <Route path="/cagnotte" element={<CagnottePage />} />
            <Route path="/u/:id" element={<PublicProfilePage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:id" element={<ConversationPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/cgu" element={<TermsPage />} />
            <Route path="/politique" element={<PrivacyPage />} />
            <Route path="/dmca" element={<DmcaPage />} />
            <Route path="/documentation" element={<DocsPage />} />
            <Route path="/account/subscription" element={<SubscriptionPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/media/new" element={<AdminMediaForm />} />
            <Route path="/admin/media/:id/edit" element={<AdminMediaForm />} />
            <Route path="/admin/users/:id" element={<AdminUserPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </main>
        {!noFooter && <Footer />}
        </>
    );
}

function App() {
    // Le code du parrain se lit une seule fois, au chargement : la navigation
    // interne efface ensuite la question de l'URL.
    useEffect(() => { captureRef(); }, []);

    return (
        <div className="App">
            <EtatConnexion />
            <Splash />
            <BrowserRouter>
                <ErrorBoundary>
                    <AuthProvider>
                        <OfflineDownloadsProvider>
                        <UploadProvider>
                            <FavoritesProvider>
                                <AppRouter />
                                <VisitTracker />
                                <GlobalUploadManager />
                                <VersionChecker />
                                <BetaNoticeDialog />
                                <DiscordInvitePopup />
                                <AideChargement />
                                <Toaster theme="dark" richColors position="top-right" />
                            </FavoritesProvider>
                        </UploadProvider>
                        </OfflineDownloadsProvider>
                    </AuthProvider>
                </ErrorBoundary>
            </BrowserRouter>
        </div>
    );
}

export default App;
