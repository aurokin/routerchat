import { Workpool } from "@convex-dev/workpool";
import { components } from "../_generated/api";

export const deleteWorkpool = new Workpool(components.deleteWorkpool, {
    maxParallelism: 2,
});
