import type { OpenRouterModel } from "../models";
import { SupportedParameter } from "../models";
import { parseOpenRouterError } from "../errors";
import { OPENROUTER_API_BASE } from "./constants";
import { OpenRouterApiErrorImpl } from "./error";
import { buildHeaders } from "./headers";
import type { OpenRouterApiModel } from "./types";

function supportsTextModality(model: OpenRouterApiModel): boolean {
    const inputModalities = model.architecture?.input_modalities ?? [];
    const outputModalities = model.architecture?.output_modalities ?? [];
    return (
        inputModalities.includes("text") && outputModalities.includes("text")
    );
}

function supportsVisionInput(model: OpenRouterApiModel): boolean {
    const inputModalities = model.architecture?.input_modalities ?? [];
    return inputModalities.includes("image");
}

function mapSupportedParameters(
    params: string[] | undefined,
): SupportedParameter[] {
    if (!params) return [];
    const result: SupportedParameter[] = [];
    for (const param of params) {
        if (param === SupportedParameter.Tools) {
            result.push(SupportedParameter.Tools);
        } else if (param === SupportedParameter.Reasoning) {
            result.push(SupportedParameter.Reasoning);
        }
    }
    return result;
}

export async function fetchModels(): Promise<OpenRouterModel[]> {
    const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
        headers: buildHeaders({}),
    });

    if (!response.ok) {
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            body = undefined;
        }
        const error = parseOpenRouterError(response, body);
        throw new OpenRouterApiErrorImpl(error);
    }

    const data = (await response.json()) as { data: OpenRouterApiModel[] };
    return data.data
        .filter((model) => supportsTextModality(model))
        .map((model) => {
            const supportedParams = mapSupportedParameters(
                model.supported_parameters,
            );
            if (supportsVisionInput(model)) {
                supportedParams.push(SupportedParameter.Vision);
            }
            return {
                id: model.id,
                name: model.id.split("/").pop() || model.id,
                provider: model.owned_by,
                supportedParameters: supportedParams,
            };
        });
}
