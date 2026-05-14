export const APP_DEFAULT_MODEL = "moonshotai/kimi-k2.5";

export interface OpenRouterModel {
    id: string;
    name: string;
    provider: string;
    supportedParameters?: SupportedParameter[];
    pricing?: {
        prompt?: string;
        completion?: string;
        image?: string;
        request?: string;
    };
    contextLength?: number;
    topProviderContextLength?: number;
    inputModalities?: string[];
    description?: string;
    expirationDate?: string;
    knowledgeCutoff?: string;
}

export enum SupportedParameter {
    Tools = "tools",
    Reasoning = "reasoning",
    Vision = "vision",
}

export function modelSupportsSearch(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Tools) ?? false
    );
}

export function modelSupportsReasoning(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Reasoning) ??
        false
    );
}

export function modelSupportsVision(
    model: OpenRouterModel | undefined,
): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Vision) ?? false
    );
}

export function modelSupportsAudio(
    model: OpenRouterModel | undefined,
): boolean {
    return model?.inputModalities?.includes("audio") ?? false;
}
