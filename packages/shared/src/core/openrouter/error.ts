import type { OpenRouterError } from "../errors";

export class OpenRouterApiErrorImpl extends Error {
    public readonly code: number;
    public readonly isRetryable: boolean;
    public readonly metadata?: OpenRouterError["metadata"];

    constructor(error: OpenRouterError) {
        super(error.message);
        this.name = "OpenRouterApiError";
        this.code = error.code;
        this.isRetryable = error.isRetryable;
        this.metadata = error.metadata;
    }
}
