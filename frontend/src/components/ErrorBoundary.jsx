import React from "react";
import { AlertTriangle, RefreshCw, Copy, Home } from "lucide-react";

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught:", error, errorInfo);
        this.setState({ errorInfo });
    }

    reset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    copy = () => {
        const err = this.state.error;
        const info = this.state.errorInfo;
        const text = [
            `Erreur : ${err?.name || "Error"}`,
            `Message : ${err?.message || "—"}`,
            `URL : ${window.location.href}`,
            `User Agent : ${navigator.userAgent}`,
            `Stack :`,
            err?.stack || "—",
            info?.componentStack ? `Component Stack :\n${info.componentStack}` : "",
        ]
            .filter(Boolean)
            .join("\n");
        navigator.clipboard.writeText(text);
    };

    render() {
        if (!this.state.hasError) return this.props.children;
        const err = this.state.error;
        return (
            <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6 py-16">
                <div className="max-w-2xl w-full">
                    <div className="flex items-center gap-3 mb-6 text-red-400">
                        <AlertTriangle size={28} />
                        <div>
                            <div className="text-xs uppercase tracking-widest text-neutral-500">Erreur inattendue</div>
                            <h1 className="font-display text-3xl text-white">{err?.name || "Erreur"}</h1>
                        </div>
                    </div>

                    <div className="p-5 rounded-lg border border-red-500/30 bg-red-500/5 mb-4">
                        <div className="text-xs uppercase tracking-widest text-red-400 mb-2">Message</div>
                        <div className="text-white break-words" data-testid="error-boundary-message">
                            {err?.message || "Aucun message fourni"}
                        </div>
                    </div>

                    {err?.stack && (
                        <details className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a] mb-4">
                            <summary className="text-xs uppercase tracking-widest text-neutral-500 cursor-pointer">
                                Stack technique
                            </summary>
                            <pre className="mt-3 text-xs text-neutral-400 overflow-x-auto whitespace-pre-wrap break-words">
                                {err.stack}
                            </pre>
                        </details>
                    )}

                    {this.state.errorInfo?.componentStack && (
                        <details className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a] mb-6">
                            <summary className="text-xs uppercase tracking-widest text-neutral-500 cursor-pointer">
                                Component stack
                            </summary>
                            <pre className="mt-3 text-xs text-neutral-400 overflow-x-auto whitespace-pre-wrap break-words">
                                {this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={this.reset}
                            data-testid="error-retry-btn"
                            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#E8D2A6] text-black font-semibold hover:bg-[#D4BB8B]"
                        >
                            <RefreshCw size={14} /> Réessayer
                        </button>
                        <button
                            onClick={this.copy}
                            className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-[#262626] text-white hover:bg-white/5"
                        >
                            <Copy size={14} /> Copier les détails
                        </button>
                        <a
                            href="/"
                            className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-[#262626] text-white hover:bg-white/5"
                        >
                            <Home size={14} /> Accueil
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}
