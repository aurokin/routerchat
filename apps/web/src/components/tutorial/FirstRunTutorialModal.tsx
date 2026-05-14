"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSafeConvexAuth } from "@/contexts/ConvexProvider";
import { useSync } from "@/contexts/SyncContext";
import { useApiKey } from "@/hooks/useApiKey";
import { getStorageUsage } from "@/lib/db";
import { validateApiKey } from "@/lib/openrouter";
import * as storage from "@/lib/storage";
import {
    ApiKeyStep,
    CloudStatusStep,
    DoneStep,
    StartStep,
    type TutorialMode,
} from "./FirstRunTutorialSteps";

const DISMISSED_KEY = "routerchat-tutorial-dismissed";
const STEP_KEY = "routerchat-tutorial-step";
const MODE_KEY = "routerchat-tutorial-mode";

type TutorialStep = "start" | "cloud-status" | "api-key" | "done";
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

export function getCloudTutorialSelectionAction(
    isAuthenticated: boolean,
    hasSignIn: boolean,
): { shouldSetAutoEnableReason: boolean; shouldSignIn: boolean } {
    return {
        shouldSetAutoEnableReason: true,
        shouldSignIn: !isAuthenticated && hasSignIn,
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

        const action = getCloudTutorialSelectionAction(
            isAuthenticated,
            Boolean(signIn),
        );

        if (action.shouldSetAutoEnableReason) {
            storage.setSyncAutoEnableReason("login");
        }

        if (action.shouldSignIn && signIn) {
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
                        <StartStep
                            mode={mode}
                            isConvexAvailable={isConvexAvailable}
                            onModeChange={setMode}
                            onSelectLocal={handleSelectLocal}
                            onSelectCloud={handleSelectCloud}
                        />
                    )}

                    {step === "cloud-status" && (
                        <CloudStatusStep
                            isConvexAvailable={isConvexAvailable}
                            isAuthenticated={isAuthenticated}
                            isAuthLoading={isAuthLoading}
                            isMigrating={isMigrating}
                            syncState={syncState}
                            onSelectCloud={handleSelectCloud}
                            onContinueLocal={() => {
                                setMode("local");
                                setStep("api-key");
                            }}
                            onNextApiKey={() => setStep("api-key")}
                        />
                    )}

                    {step === "api-key" && (
                        <ApiKeyStep
                            newApiKey={newApiKey}
                            validating={validating}
                            validationResult={validationResult}
                            saving={saving}
                            onApiKeyChange={(value) => {
                                setNewApiKey(value);
                                setValidationResult(null);
                            }}
                            onValidateApiKey={handleValidateApiKey}
                            onSaveApiKey={handleSaveApiKey}
                            onSkipApiKey={handleSkipApiKey}
                        />
                    )}

                    {step === "done" && <DoneStep onFinish={handleFinish} />}
                </div>
            </div>
        </div>
    );
}
