"use client";

import {
    Check,
    Cloud,
    ExternalLink,
    Key,
    Loader2,
    Monitor,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SyncState } from "@/lib/sync/types";
import * as storage from "@/lib/storage";
import { cn, externalLinkProps } from "@/lib/utils";

export type TutorialMode = "local" | "cloud";

export function StartStep(props: {
    mode: TutorialMode;
    isConvexAvailable: boolean;
    onModeChange: (mode: TutorialMode) => void;
    onSelectLocal: () => void;
    onSelectCloud: () => void;
}) {
    const {
        mode,
        isConvexAvailable,
        onModeChange,
        onSelectLocal,
        onSelectCloud,
    } = props;

    return (
        <div className="space-y-5">
            <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    Choose how you want to store your data. Local-only is the
                    default experience.
                </p>
                <div className="grid gap-3">
                    <ModeButton
                        selected={mode === "local"}
                        icon={<Monitor size={16} className="text-primary" />}
                        title="Local Storage"
                        description="Everything stays on this device."
                        onClick={() => onModeChange("local")}
                    />
                    <ModeButton
                        selected={mode === "cloud"}
                        disabled={!isConvexAvailable}
                        icon={<Cloud size={16} className="text-primary" />}
                        title="Cloud Sync"
                        description="Sync across devices with Convex."
                        onClick={() => onModeChange("cloud")}
                    />
                </div>
            </div>
            <div className="flex flex-wrap gap-3 justify-end">
                {mode === "cloud" ? (
                    <button
                        type="button"
                        onClick={onSelectCloud}
                        disabled={!isConvexAvailable}
                        className="btn-deco btn-deco-primary cursor-pointer"
                    >
                        <span className="text-sm">Next: Sign In</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onSelectLocal}
                        className="btn-deco btn-deco-primary cursor-pointer"
                    >
                        <span className="text-sm">Next: Continue Locally</span>
                    </button>
                )}
            </div>
        </div>
    );
}

function ModeButton(props: {
    selected: boolean;
    disabled?: boolean;
    icon: ReactNode;
    title: string;
    description: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            disabled={props.disabled}
            className={cn(
                "border px-4 py-3 text-left transition-colors",
                props.selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background-elevated hover:border-primary/40",
                props.disabled && "opacity-60 cursor-not-allowed",
            )}
        >
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 flex items-center justify-center">
                    {props.icon}
                </div>
                <div>
                    <p className="text-sm font-medium">{props.title}</p>
                    <p className="text-xs text-muted-foreground">
                        {props.description}
                    </p>
                </div>
            </div>
        </button>
    );
}

export function CloudStatusStep(props: {
    isConvexAvailable: boolean;
    isAuthenticated: boolean;
    isAuthLoading: boolean;
    isMigrating: boolean;
    syncState: SyncState;
    onSelectCloud: () => void;
    onContinueLocal: () => void;
    onNextApiKey: () => void;
}) {
    if (!props.isConvexAvailable) {
        return (
            <div className="space-y-5">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Cloud size={16} />
                        <span>Cloud sync unavailable</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Cloud sync is not configured for this deployment.
                        Continue with local storage.
                    </p>
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => {
                            storage.clearSyncAutoEnableReason();
                            props.onContinueLocal();
                        }}
                        className="btn-deco btn-deco-primary cursor-pointer"
                    >
                        <span className="text-sm">Continue Locally</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Cloud size={16} />
                    <span>Cloud sync setup</span>
                </div>
                <p className="text-sm text-muted-foreground">
                    {props.isAuthenticated
                        ? "Signed in. Enabling cloud sync..."
                        : "Sign in with Google to enable cloud sync."}
                </p>
            </div>
            <div className="border border-border bg-muted/20 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Status</span>
                    <span
                        className={
                            props.isAuthenticated
                                ? "text-success"
                                : "text-muted-foreground"
                        }
                    >
                        {props.isAuthLoading
                            ? "Checking..."
                            : props.isAuthenticated
                              ? "Signed in"
                              : "Signed out"}
                    </span>
                </div>
                {props.isAuthenticated && (
                    <div className="flex items-center gap-2 text-xs text-success mt-2">
                        {props.isMigrating ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Check size={12} />
                        )}
                        <span>
                            {props.syncState === "cloud-enabled"
                                ? "Cloud sync is enabled."
                                : "Enabling cloud sync..."}
                        </span>
                    </div>
                )}
            </div>

            {!props.isAuthenticated && (
                <button
                    type="button"
                    onClick={props.onSelectCloud}
                    className="btn-deco btn-deco-primary w-full cursor-pointer"
                >
                    <span className="text-sm">Sign In</span>
                </button>
            )}

            {props.isAuthenticated && props.syncState === "cloud-enabled" && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={props.onNextApiKey}
                        className="btn-deco btn-deco-primary cursor-pointer"
                    >
                        <span className="text-sm">Next: Add API Key</span>
                    </button>
                </div>
            )}
        </div>
    );
}

export function ApiKeyStep(props: {
    newApiKey: string;
    validating: boolean;
    validationResult: boolean | null;
    saving: boolean;
    onApiKeyChange: (value: string) => void;
    onValidateApiKey: () => void;
    onSaveApiKey: () => void;
    onSkipApiKey: () => void;
}) {
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Key size={16} />
                    <span>Connect your API key</span>
                </div>
                <p className="text-sm text-muted-foreground">
                    RouterChat uses your OpenRouter API key for all requests,
                    even when cloud sync is enabled.
                </p>
            </div>
            <div className="space-y-3">
                <div>
                    <label htmlFor="tutorial-api-key" className="label-deco">
                        API Key
                    </label>
                    <input
                        id="tutorial-api-key"
                        type="password"
                        value={props.newApiKey}
                        onChange={(event) =>
                            props.onApiKeyChange(event.target.value)
                        }
                        placeholder="sk-or-..."
                        className="input-deco font-mono"
                    />
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={props.onValidateApiKey}
                        disabled={props.validating || !props.newApiKey.trim()}
                        className="btn-deco btn-deco-secondary cursor-pointer"
                    >
                        {props.validating ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Check size={14} />
                        )}
                        <span className="text-sm">Validate</span>
                    </button>
                    <button
                        type="button"
                        onClick={props.onSaveApiKey}
                        disabled={props.saving || !props.newApiKey.trim()}
                        className="btn-deco btn-deco-primary cursor-pointer"
                    >
                        <span className="text-sm">
                            {props.saving ? "Saving..." : "Save Key"}
                        </span>
                    </button>
                </div>
                {props.validationResult === true && (
                    <div className="flex items-center gap-2 text-success px-3 py-2 bg-success/5 border border-success/20">
                        <Check size={14} />
                        <span className="text-sm font-medium">
                            Valid API key
                        </span>
                    </div>
                )}
                {props.validationResult === false && (
                    <div className="flex items-center gap-2 text-error px-3 py-2 bg-error/5 border border-error/20">
                        <span className="text-sm font-medium">
                            Invalid API key
                        </span>
                    </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted/30 border border-border">
                    <ExternalLink size={14} className="flex-shrink-0" />
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
                    onClick={props.onSkipApiKey}
                    className="btn-deco btn-deco-secondary cursor-pointer"
                >
                    <span className="text-sm">Next</span>
                </button>
            </div>
        </div>
    );
}

export function DoneStep({ onFinish }: { onFinish: () => void }) {
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Check size={16} className="text-success" />
                    <span>All set</span>
                </div>
                <p className="text-sm text-muted-foreground">
                    You can tweak everything later in Settings.
                </p>
            </div>
            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onFinish}
                    className="btn-deco btn-deco-primary cursor-pointer"
                >
                    <span className="text-sm">Finish</span>
                </button>
            </div>
        </div>
    );
}
