"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/chat/Sidebar";
import { KeybindingsContent } from "@/components/keybindings/KeybindingsContent";
import { SettingsSkills } from "./_components/SettingsSkills";
import { SettingsLocalData } from "./_components/SettingsLocalData";
import { useChat } from "@/contexts/ChatContext";
import { useSync } from "@/contexts/SyncContext";
import { useSettings } from "@/contexts/SettingsContext";
import { validateApiKey } from "@/lib/openrouter";
import {
    Settings,
    Key,
    Moon,
    Sun,
    Monitor,
    Check,
    X,
    Loader2,
    Shield,
    ExternalLink,
    Info,
    Hexagon,
    Keyboard,
    ChevronDown,
    Zap,
} from "lucide-react";
import { cn, externalLinkProps } from "@/lib/utils";
const CloudSyncSettings = dynamic(
    () =>
        import("@/components/sync/CloudSyncSettings").then(
            (mod) => mod.CloudSyncSettings,
        ),
    { ssr: false },
);

const isKeybindingBlocked = () => {
    if (typeof document === "undefined") return false;
    return Boolean(
        document.querySelector(
            "[data-keybinding-scope='modal'][data-keybinding-open='true'], [data-keybinding-scope='dropdown'][data-keybinding-open='true']",
        ),
    );
};

const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

function SettingsPageContent() {
    const router = useRouter();
    const { currentChat, clearCurrentChat } = useChat();
    const { syncState } = useSync();
    const {
        apiKey,
        setApiKey,
        clearApiKey,
        theme,
        setTheme,
        promptCacheEnabled,
        setPromptCacheEnabled,
    } = useSettings();
    const [newApiKey, setNewApiKey] = useState(apiKey || "");
    const lastApiKeyRef = useRef<string | null>(apiKey ?? null);
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<boolean | null>(
        null,
    );
    const [saving, setSaving] = useState(false);
    const searchParams = useSearchParams();
    const [highlightCloudSync, setHighlightCloudSync] = useState(false);
    const [highlightApiKey, setHighlightApiKey] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const highlight = searchParams.get("highlight");
        setHighlightCloudSync(highlight === "cloud-sync");
        setHighlightApiKey(highlight === "api-key");

        const hash = window.location.hash.replace("#", "");
        if (hash) {
            const target = document.getElementById(hash);
            if (target) {
                requestAnimationFrame(() => {
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                    });
                });
            }
        }

        if (!highlight) return;
        const timeout = window.setTimeout(() => {
            setHighlightCloudSync(false);
            setHighlightApiKey(false);
        }, 4000);
        return () => window.clearTimeout(timeout);
    }, [searchParams]);

    useEffect(() => {
        if (apiKey !== lastApiKeyRef.current) {
            const lastApiKey = lastApiKeyRef.current ?? "";
            if (!newApiKey || newApiKey === lastApiKey) {
                setNewApiKey(apiKey ?? "");
            }
            lastApiKeyRef.current = apiKey ?? null;
        }
    }, [apiKey, newApiKey]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isKeybindingBlocked()) return;

            if (isTypingTarget(event.target)) return;

            if (event.shiftKey || event.altKey) return;

            const key = event.key.toLowerCase();
            const hasModifier = event.metaKey || event.ctrlKey;

            if (!hasModifier || key !== "," || event.repeat) return;

            event.preventDefault();
            event.stopPropagation();
            if (!currentChat) {
                clearCurrentChat();
            }
            router.push("/chat");
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [clearCurrentChat, currentChat, router]);

    const validateCurrentKey = async (key: string) => {
        setValidating(true);
        setValidationResult(null);
        const isValid = await validateApiKey(key);
        setValidationResult(isValid);
        setValidating(false);
        return isValid;
    };

    const handleValidate = async () => {
        const trimmedKey = newApiKey.trim();
        if (!trimmedKey) return;
        await validateCurrentKey(trimmedKey);
    };

    const handleSave = async () => {
        const trimmedKey = newApiKey.trim();
        setSaving(true);
        try {
            // Only allow saving an unvalidated key if the user is explicitly clearing it.
            if (!trimmedKey) {
                clearApiKey();
                setValidationResult(null);
                return;
            }

            const isValid = await validateCurrentKey(trimmedKey);
            if (!isValid) return;

            setApiKey(trimmedKey);
        } finally {
            setSaving(false);
        }
    };

    const handleClear = () => {
        setNewApiKey("");
        clearApiKey();
        setValidationResult(null);
    };

    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-background relative">
                {/* Decorative background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-radial from-primary/8 via-primary/3 to-transparent" />
                    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-radial from-accent/5 via-transparent to-transparent" />
                </div>

                <div className="max-w-2xl mx-auto p-8 relative z-10">
                    {/* Header */}
                    <div className="mb-10">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="relative">
                                <Hexagon
                                    size={48}
                                    className="text-primary"
                                    strokeWidth={1}
                                />
                                <Settings
                                    size={20}
                                    className="absolute inset-0 m-auto text-primary"
                                />
                            </div>
                            <div>
                                <h1 className="text-3xl font-light tracking-tight">
                                    Settings
                                </h1>
                                <p className="text-muted-foreground text-sm">
                                    Configure your preferences
                                </p>
                            </div>
                        </div>
                        <div className="h-px bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
                    </div>

                    {/* OpenRouter API Key */}
                    <section
                        id="api-key"
                        className={cn(
                            "card-deco mb-6",
                            highlightApiKey &&
                                "ring-2 ring-primary/40 shadow-deco",
                        )}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-primary/10 flex items-center justify-center">
                                <Key size={16} className="text-primary" />
                            </div>
                            <h2 className="text-lg font-medium">
                                OpenRouter API Key
                            </h2>
                        </div>

                        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                            Enter your OpenRouter API key to enable AI model
                            access. Requests are sent directly to OpenRouter
                            from your device.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="apiKey" className="label-deco">
                                    API Key
                                </label>
                                <input
                                    id="apiKey"
                                    type="password"
                                    value={newApiKey}
                                    onChange={(e) => {
                                        setNewApiKey(e.target.value);
                                        setValidationResult(null);
                                    }}
                                    placeholder="sk-or-..."
                                    className="input-deco font-mono"
                                />
                                <div className="mt-2 text-xs text-muted-foreground">
                                    {syncState === "cloud-enabled"
                                        ? "Stored in cloud sync (encrypted)."
                                        : "Stored locally in this browser."}
                                </div>
                            </div>

                            {apiKey && newApiKey.trim() === apiKey && (
                                <div className="flex items-center gap-2 text-success px-3 py-2 bg-success/5 border border-success/20">
                                    <Check size={14} />
                                    <span className="text-sm font-medium">
                                        API key saved
                                    </span>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={handleValidate}
                                    disabled={
                                        validating ||
                                        saving ||
                                        !newApiKey.trim()
                                    }
                                    className="btn-deco btn-deco-secondary cursor-pointer"
                                >
                                    {validating ? (
                                        <Loader2
                                            size={14}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <Shield size={14} />
                                    )}
                                    <span className="text-sm">Validate</span>
                                </button>

                                <button
                                    onClick={handleSave}
                                    disabled={saving || validating}
                                    className="btn-deco btn-deco-primary cursor-pointer"
                                >
                                    <span className="text-sm">
                                        {validating
                                            ? "Validating..."
                                            : saving
                                              ? "Saving..."
                                              : "Save Key"}
                                    </span>
                                </button>

                                {apiKey && (
                                    <button
                                        onClick={handleClear}
                                        className="px-4 py-2 text-error border border-error/30 hover:bg-error/10 transition-colors text-sm cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>

                            {validationResult === true && (
                                <div className="flex items-center gap-2 text-success px-3 py-2 bg-success/5 border border-success/20">
                                    <Check size={14} />
                                    <span className="text-sm font-medium">
                                        Valid API key
                                    </span>
                                </div>
                            )}

                            {validationResult === false && (
                                <div className="flex items-center gap-2 text-error px-3 py-2 bg-error/5 border border-error/20">
                                    <X size={14} />
                                    <span className="text-sm font-medium">
                                        Invalid API key
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted/30 border border-border">
                                <ExternalLink
                                    size={14}
                                    className="flex-shrink-0"
                                />
                                <span>
                                    Get your API key from{" "}
                                    <a
                                        href="https://openrouter.ai/keys"
                                        {...externalLinkProps}
                                        className="text-primary hover:underline"
                                    >
                                        openrouter.ai/keys
                                    </a>
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Prompt caching */}
                    <section className="card-deco mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                                <Zap size={16} className="text-accent" />
                            </div>
                            <h2 className="text-lg font-medium">
                                Prompt caching
                            </h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Mark the system prompt and skill preamble with{" "}
                            <code className="text-xs">cache_control</code> so
                            providers that support OpenRouter prompt caching
                            (e.g. Anthropic) can serve them from cache. Reduces
                            cost on repeat turns of long-running chats.
                        </p>
                        <label className="flex items-center justify-between gap-4 cursor-pointer select-none border border-border bg-background-elevated px-4 py-3 hover:border-primary/40 transition-colors">
                            <span className="text-sm font-medium">
                                Enable prompt caching
                            </span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer accent-primary"
                                checked={promptCacheEnabled}
                                onChange={(e) =>
                                    setPromptCacheEnabled(e.target.checked)
                                }
                                aria-label="Enable prompt caching"
                            />
                        </label>
                    </section>

                    {/* Theme & Keybindings */}
                    <section className="card-deco mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-warning/10 flex items-center justify-center">
                                <Sun size={16} className="text-warning" />
                            </div>
                            <h2 className="text-lg font-medium">Theme</h2>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => setTheme("light")}
                                className={cn(
                                    "p-4 border flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer",
                                    theme === "light"
                                        ? "border-primary bg-primary/10 shadow-deco"
                                        : "border-border hover:border-primary/40 bg-background-elevated",
                                )}
                            >
                                <Sun
                                    size={22}
                                    className={
                                        theme === "light"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="text-xs font-medium">
                                    Light
                                </span>
                            </button>

                            <button
                                onClick={() => setTheme("dark")}
                                className={cn(
                                    "p-4 border flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer",
                                    theme === "dark"
                                        ? "border-primary bg-primary/10 shadow-deco"
                                        : "border-border hover:border-primary/40 bg-background-elevated",
                                )}
                            >
                                <Moon
                                    size={22}
                                    className={
                                        theme === "dark"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="text-xs font-medium">
                                    Dark
                                </span>
                            </button>

                            <button
                                onClick={() => setTheme("system")}
                                className={cn(
                                    "p-4 border flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer",
                                    theme === "system"
                                        ? "border-primary bg-primary/10 shadow-deco"
                                        : "border-border hover:border-primary/40 bg-background-elevated",
                                )}
                            >
                                <Monitor
                                    size={22}
                                    className={
                                        theme === "system"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }
                                />
                                <span className="text-xs font-medium">
                                    System
                                </span>
                            </button>
                        </div>

                        <div className="mt-6 flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                                <Keyboard size={16} className="text-accent" />
                            </div>
                            <h2 className="text-lg font-medium">Keybindings</h2>
                        </div>
                        <details className="group">
                            <summary className="flex items-center justify-between gap-4 cursor-pointer select-none border border-border bg-background-elevated px-4 py-3 text-sm text-foreground hover:border-primary/40 transition-colors">
                                <span className="font-medium">
                                    Built-in shortcuts and scopes
                                </span>
                                <ChevronDown
                                    size={16}
                                    className="text-muted-foreground transition-transform group-open:rotate-180"
                                />
                            </summary>
                            <div className="mt-4">
                                <KeybindingsContent />
                            </div>
                        </details>
                    </section>

                    <SettingsSkills />

                    {/* Cloud Sync - only shown when Convex is available */}
                    <CloudSyncSettings highlightEnable={highlightCloudSync} />

                    {/* About */}
                    <section className="card-deco">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-accent/10 flex items-center justify-center">
                                <Info size={16} className="text-accent" />
                            </div>
                            <h2 className="text-lg font-medium">About</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                            RouterChat provides a unified interface for AI
                            conversations through OpenRouter, with a flexible
                            setup that lets you choose how your data is stored.
                        </p>
                        <details className="group mt-4">
                            <summary className="flex items-center justify-between gap-4 cursor-pointer select-none border border-border bg-background-elevated px-4 py-3 text-sm text-foreground hover:border-primary/40 transition-colors">
                                <span className="font-medium">Learn More</span>
                                <ChevronDown
                                    size={16}
                                    className="text-muted-foreground transition-transform group-open:rotate-180"
                                />
                            </summary>
                            <div className="mt-4 space-y-4">
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Local Only
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        RouterChat works offline by default.
                                        Your data stays on this device, and
                                        requests are sent directly to OpenRouter
                                        using your API key.
                                    </p>
                                </div>
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Cloud Sync
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Sign in to sync your conversations
                                        across devices. Sync is powered by
                                        Convex, and API keys are stored in
                                        encrypted form for additional safety.
                                    </p>
                                </div>
                                <div className="border border-border bg-muted/20 p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Our Ethos
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Choose any model available through
                                        OpenRouter and tailor the experience to
                                        your workflow. RouterChat is built to
                                        maximize flexibility and put you in
                                        control.
                                    </p>
                                </div>
                            </div>
                        </details>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-4">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                            <span>Version 0.2.0</span>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
                    Loading settings...
                </div>
            }
        >
            <SettingsPageContent />
        </Suspense>
    );
}
