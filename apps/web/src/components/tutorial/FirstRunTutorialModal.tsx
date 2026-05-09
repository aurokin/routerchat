"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Check,
    Cloud,
    ExternalLink,
    Key,
    Loader2,
    Monitor,
    X,
} from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSafeConvexAuth } from "@/contexts/ConvexProvider";
import { useSync } from "@/contexts/SyncContext";
import { useApiKey } from "@/hooks/useApiKey";
import { getStorageUsage } from "@/lib/db";
import { validateApiKey } from "@/lib/openrouter";
import * as storage from "@/lib/storage";
import { cn, externalLinkProps } from "@/lib/utils";

const DISMISSED_KEY = "routerchat-tutorial-dismissed";
const STEP_KEY = "routerchat-tutorial-step";
const MODE_KEY = "routerchat-tutorial-mode";

type TutorialStep = "start" | "cloud-status" | "api-key" | "done";
type TutorialMode = "local" | "cloud";

interface TutorialVisibilityInput {
    localSessions: number | null;
    isApiKeyLoading: boolean;
    isDismissed: boolean;
    hasPendingStep: boolean;
    noLocalData: boolean;
}

interface TutorialVisibilityState {
    shouldUpdate: boolean;
    shouldSetStartStep: boolean;
    isVisible: boolean;
}

export function getNoLocalData(
    localSessions: number | null,
    apiKey: string | null,
    isApiKeyLoading: boolean,
): boolean {
    if (localSessions === null || isApiKeyLoading) return false;
    return localSessions === 0 || !apiKey;
}

export function getTutorialVisibilityState(
    input: TutorialVisibilityInput,
): TutorialVisibilityState {
    if (input.localSessions === null || input.isApiKeyLoading) {
        return {
            shouldUpdate: false,
            shouldSetStartStep: false,
            isVisible: false,
        };
    }

    if (input.isDismissed) {
        return {
            shouldUpdate: true,
            shouldSetStartStep: false,
            isVisible: false,
        };
    }

    const shouldSetStartStep = !input.hasPendingStep && input.noLocalData;
    const isVisible = input.hasPendingStep || input.noLocalData;

    return {
        shouldUpdate: true,
        shouldSetStartStep,
        isVisible,
    };
}

export function FirstRunTutorialModal() {
    const { apiKey, isLoading: isApiKeyLoading, setApiKey } = useApiKey();
    const {
        syncState,
        enableCloudSync,
        isMigrating,
        isConvexAvailable,
        isInitialSyncLoaded,
    } = useSync();
    const { isAuthenticated, isLoading: isAuthLoading } = useSafeConvexAuth();
    const { signIn } = useAuthActions() ?? {};

    const [localSessions, setLocalSessions] = useState<number | null>(null);
    const [step, setStep] = useState<TutorialStep | null>(null);
    const [mode, setMode] = useState<TutorialMode>("local");
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const [newApiKey, setNewApiKey] = useState(apiKey ?? "");
    const [validating, setValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<boolean | null>(
        null,
    );
    const [saving, setSaving] = useState(false);

    const autoEnableRef = useRef(false);

    useEffect(() => {
        let isActive = true;

        const loadUsage = async () => {
            try {
                const usage = await getStorageUsage();
                if (isActive) {
                    setLocalSessions(usage.sessions);
                }
            } catch (error) {
                console.error("Failed to read local storage usage:", error);
                if (isActive) {
                    setLocalSessions(0);
                }
            }
        };

        if (typeof window !== "undefined") {
            const storedDismissed =
                window.localStorage.getItem(DISMISSED_KEY) === "true";
            const storedStep = window.localStorage.getItem(
                STEP_KEY,
            ) as TutorialStep | null;
            const storedMode = window.localStorage.getItem(
                MODE_KEY,
            ) as TutorialMode | null;

            setIsDismissed(storedDismissed);
            if (storedMode) setMode(storedMode);
            if (storedStep) setStep(storedStep);
        }

        void loadUsage();

        return () => {
            isActive = false;
        };
    }, []);

    const hasPendingStep = step !== null;

    const noLocalData = useMemo(() => {
        return getNoLocalData(localSessions, apiKey ?? null, isApiKeyLoading);
    }, [localSessions, apiKey, isApiKeyLoading]);

    useEffect(() => {
        const visibility = getTutorialVisibilityState({
            localSessions,
            isApiKeyLoading,
            isDismissed,
            hasPendingStep,
            noLocalData,
        });

        if (!visibility.shouldUpdate) return;

        if (visibility.shouldSetStartStep) {
            setStep("start");
        }

        setIsVisible(visibility.isVisible);
    }, [
        localSessions,
        isApiKeyLoading,
        hasPendingStep,
        noLocalData,
        isDismissed,
    ]);

    useEffect(() => {
        if (isDismissed || !step || typeof window === "undefined") {
            return;
        }

        window.localStorage.setItem(STEP_KEY, step);
        window.localStorage.setItem(MODE_KEY, mode);
    }, [step, mode, isDismissed]);

    useEffect(() => {
        if (step === "cloud-status") {
            autoEnableRef.current = false;
        }
    }, [step]);

    useEffect(() => {
        setNewApiKey(apiKey ?? "");
        setValidationResult(null);
    }, [apiKey]);

    useEffect(() => {
        if (step !== "cloud-status") return;
        if (!isAuthenticated) return;

        const autoEnableReason = storage.getSyncAutoEnableReason();
        if (!autoEnableReason) return;

        if (!isInitialSyncLoaded) return;

        if (syncState === "cloud-enabled") {
            storage.clearSyncAutoEnableReason();
            if (apiKey) {
                setStep("done");
            } else {
                setStep("api-key");
            }
            return;
        }

        if (autoEnableRef.current || isMigrating) return;

        autoEnableRef.current = true;
        enableCloudSync()
            .then(() => {
                storage.clearSyncAutoEnableReason();
                if (apiKey) {
                    setStep("done");
                } else {
                    setStep("api-key");
                }
            })
            .catch((error) => {
                console.error("Failed to enable cloud sync:", error);
                storage.clearSyncAutoEnableReason();
                autoEnableRef.current = false;
            });
    }, [
        apiKey,
        enableCloudSync,
        isAuthenticated,
        isInitialSyncLoaded,
        isMigrating,
        step,
        syncState,
    ]);

    useEffect(() => {
        if (step === "api-key" && apiKey) {
            setStep("done");
        }
    }, [apiKey, step]);

    const handleDismiss = useCallback(() => {
        setIsDismissed(true);
        setIsVisible(false);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(DISMISSED_KEY, "true");
            window.localStorage.removeItem(STEP_KEY);
            window.localStorage.removeItem(MODE_KEY);
        }
    }, []);

    useEffect(() => {
        if (!isVisible) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                handleDismiss();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleDismiss, isVisible]);

    const handleSelectLocal = useCallback(() => {
        setMode("local");
        setStep("api-key");
    }, []);

    const handleSelectCloud = useCallback(() => {
        setMode("cloud");
        setStep("cloud-status");

        if (!isAuthenticated && signIn) {
            storage.setSyncAutoEnableReason("login");
            signIn("google", { redirectTo: "/chat?tutorial=cloud" });
        }
    }, [isAuthenticated, signIn]);

    const handleSkipApiKey = useCallback(() => {
        setStep("done");
    }, []);

    const handleValidateApiKey = useCallback(async () => {
        if (!newApiKey.trim()) return;
        setValidating(true);
        setValidationResult(null);
        const isValid = await validateApiKey(newApiKey.trim());
        setValidationResult(isValid);
        setValidating(false);
    }, [newApiKey]);

    const handleSaveApiKey = useCallback(async () => {
        if (!newApiKey.trim()) return;
        setSaving(true);
        try {
            await setApiKey(newApiKey.trim());
        } finally {
            setSaving(false);
        }
    }, [newApiKey, setApiKey]);

    const handleFinish = useCallback(() => {
        setIsDismissed(true);
        setStep(null);
        setIsVisible(false);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(DISMISSED_KEY, "true");
            window.localStorage.removeItem(STEP_KEY);
            window.localStorage.removeItem(MODE_KEY);
        }
    }, []);

    if (!isVisible || isDismissed) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            data-keybinding-scope="modal"
            data-keybinding-open="true"
        >
            <div
                className="absolute inset-0 bg-black/60"
                onClick={handleDismiss}
                aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-lg border border-border bg-background-elevated shadow-xl">
                <div className="px-6 pt-6 pb-4 border-b border-border">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-muted-foreground">
                                Quick Setup
                            </p>
                            <h2 className="text-2xl font-semibold text-foreground mt-2">
                                Welcome to RouterChat
                            </h2>
                            <p className="text-sm text-muted-foreground mt-2">
                                Pick a sync mode, add your API key, and you are
                                ready to chat.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Dismiss tutorial"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-6 py-5 space-y-6">
                    {step === "start" && (
                        <div className="space-y-5">
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Choose how you want to store your data.
                                    Local-only is the default experience.
                                </p>
                                <div className="grid gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setMode("local")}
                                        className={cn(
                                            "border px-4 py-3 text-left transition-colors",
                                            mode === "local"
                                                ? "border-primary bg-primary/10"
                                                : "border-border bg-background-elevated hover:border-primary/40",
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-primary/10 flex items-center justify-center">
                                                <Monitor
                                                    size={16}
                                                    className="text-primary"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">
                                                    Local Storage
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Everything stays on this
                                                    device.
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode("cloud")}
                                        disabled={!isConvexAvailable}
                                        className={cn(
                                            "border px-4 py-3 text-left transition-colors",
                                            mode === "cloud"
                                                ? "border-primary bg-primary/10"
                                                : "border-border bg-background-elevated hover:border-primary/40",
                                            !isConvexAvailable &&
                                                "opacity-60 cursor-not-allowed",
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-primary/10 flex items-center justify-center">
                                                <Cloud
                                                    size={16}
                                                    className="text-primary"
                                                />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">
                                                    Cloud Sync
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Sync across devices with
                                                    Convex.
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-3 justify-end">
                                {mode === "cloud" ? (
                                    <button
                                        type="button"
                                        onClick={handleSelectCloud}
                                        disabled={!isConvexAvailable}
                                        className="btn-deco btn-deco-primary cursor-pointer"
                                    >
                                        <span className="text-sm">
                                            Next: Sign In
                                        </span>
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleSelectLocal}
                                        className="btn-deco btn-deco-primary cursor-pointer"
                                    >
                                        <span className="text-sm">
                                            Next: Continue Locally{" "}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {step === "cloud-status" && !isConvexAvailable && (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Cloud size={16} />
                                    <span>Cloud sync unavailable</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Cloud sync is not configured for this
                                    deployment. Continue with local storage —
                                    your data will stay on this device.
                                </p>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        storage.clearSyncAutoEnableReason();
                                        setMode("local");
                                        setStep("api-key");
                                    }}
                                    className="btn-deco btn-deco-primary cursor-pointer"
                                >
                                    <span className="text-sm">
                                        Continue Locally
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "cloud-status" && isConvexAvailable && (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Cloud size={16} />
                                    <span>Cloud sync setup</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {isAuthenticated
                                        ? "Signed in. Enabling cloud sync..."
                                        : "Sign in with Google to enable cloud sync."}
                                </p>
                            </div>
                            <div className="border border-border bg-muted/20 px-4 py-3 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">
                                        Status
                                    </span>
                                    <span
                                        className={
                                            isAuthenticated
                                                ? "text-success"
                                                : "text-muted-foreground"
                                        }
                                    >
                                        {isAuthLoading
                                            ? "Checking..."
                                            : isAuthenticated
                                              ? "Signed in"
                                              : "Signed out"}
                                    </span>
                                </div>
                                {isAuthenticated && (
                                    <div className="flex items-center gap-2 text-xs text-success mt-2">
                                        {isMigrating ? (
                                            <Loader2
                                                size={12}
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <Check size={12} />
                                        )}
                                        <span>
                                            {syncState === "cloud-enabled"
                                                ? "Cloud sync is enabled."
                                                : "Enabling cloud sync..."}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {!isAuthenticated && (
                                <button
                                    type="button"
                                    onClick={handleSelectCloud}
                                    className="btn-deco btn-deco-primary w-full cursor-pointer"
                                >
                                    <span className="text-sm">Sign In</span>
                                </button>
                            )}

                            {isAuthenticated &&
                                syncState === "cloud-enabled" && (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setStep("api-key")}
                                            className="btn-deco btn-deco-primary cursor-pointer"
                                        >
                                            <span className="text-sm">
                                                Next: Add API Key{" "}
                                            </span>
                                        </button>
                                    </div>
                                )}
                        </div>
                    )}

                    {step === "api-key" && (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Key size={16} />
                                    <span>Connect your API key</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    RouterChat uses your OpenRouter API key for
                                    all requests, even when cloud sync is
                                    enabled.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label
                                        htmlFor="tutorial-api-key"
                                        className="label-deco"
                                    >
                                        API Key
                                    </label>
                                    <input
                                        id="tutorial-api-key"
                                        type="password"
                                        value={newApiKey}
                                        onChange={(event) => {
                                            setNewApiKey(event.target.value);
                                            setValidationResult(null);
                                        }}
                                        placeholder="sk-or-..."
                                        className="input-deco font-mono"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={handleValidateApiKey}
                                        disabled={
                                            validating || !newApiKey.trim()
                                        }
                                        className="btn-deco btn-deco-secondary cursor-pointer"
                                    >
                                        {validating ? (
                                            <Loader2
                                                size={14}
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <Check size={14} />
                                        )}
                                        <span className="text-sm">
                                            Validate
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveApiKey}
                                        disabled={saving || !newApiKey.trim()}
                                        className="btn-deco btn-deco-primary cursor-pointer"
                                    >
                                        <span className="text-sm">
                                            {saving ? "Saving..." : "Save Key"}
                                        </span>
                                    </button>
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
                                        Get your key from{" "}
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
                            <div className="flex flex-wrap gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={handleSkipApiKey}
                                    className="btn-deco btn-deco-secondary cursor-pointer"
                                >
                                    <span className="text-sm">Next</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "done" && (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Check size={16} className="text-success" />
                                    <span>All set</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    You can tweak everything later in Settings.
                                    If you have questions, that is the best
                                    place to look.
                                </p>
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={handleFinish}
                                    className="btn-deco btn-deco-primary cursor-pointer"
                                >
                                    <span className="text-sm">Finish</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
