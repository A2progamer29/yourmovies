import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
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
import PaymentSuccess from "@/pages/PaymentSuccess";
import SubscriptionPage from "@/pages/SubscriptionPage";
import ProfilesPage from "@/pages/ProfilesPage";
import SettingsPage from "@/pages/SettingsPage";
import WishboardPage from "@/pages/WishboardPage";
import CoinsPage from "@/pages/CoinsPage";
import CagnottePage from "@/pages/CagnottePage";
import PublicProfilePage from "@/pages/PublicProfilePage";

function AppRouter() {
    const location = useLocation();
    if (location.hash?.includes("session_id=")) {
        return <AuthCallback />;
    }
    return (
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
            <Route path="/account/subscription" element={<SubscriptionPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/media/new" element={<AdminMediaForm />} />
            <Route path="/admin/media/:id/edit" element={<AdminMediaForm />} />
            <Route path="/admin/users/:id" element={<AdminUserPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/payment/success" element={<PaymentSuccess />} />
        </Routes>
    );
}

function App() {
    return (
        <div className="App">
            <Splash />
            <BrowserRouter>
                <ErrorBoundary>
                    <AuthProvider>
                        <AppRouter />
                        <Toaster theme="dark" richColors position="top-right" />
                    </AuthProvider>
                </ErrorBoundary>
            </BrowserRouter>
        </div>
    );
}

export default App;
