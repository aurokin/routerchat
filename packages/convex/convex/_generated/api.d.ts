/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKey from "../apiKey.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as cleanup from "../cleanup.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_delete_operations from "../lib/delete_operations.js";
import type * as lib_delete_workpool from "../lib/delete_workpool.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_rate_limits from "../lib/rate_limits.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_usage_aggregates from "../lib/usage_aggregates.js";
import type * as messages from "../messages.js";
import type * as skills from "../skills.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKey: typeof apiKey;
  attachments: typeof attachments;
  auth: typeof auth;
  chats: typeof chats;
  cleanup: typeof cleanup;
  http: typeof http;
  "lib/authz": typeof lib_authz;
  "lib/delete_operations": typeof lib_delete_operations;
  "lib/delete_workpool": typeof lib_delete_workpool;
  "lib/encryption": typeof lib_encryption;
  "lib/limits": typeof lib_limits;
  "lib/pagination": typeof lib_pagination;
  "lib/rate_limits": typeof lib_rate_limits;
  "lib/storage": typeof lib_storage;
  "lib/usage_aggregates": typeof lib_usage_aggregates;
  messages: typeof messages;
  skills: typeof skills;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  deleteWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"deleteWorkpool">;
  chatUsage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"chatUsage">;
  messageUsage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"messageUsage">;
  skillUsage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"skillUsage">;
  attachmentUsage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"attachmentUsage">;
  imageAttachmentUsage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"imageAttachmentUsage">;
  contentRateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"contentRateLimiter">;
};
