import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";

const app = defineApp();

app.use(workpool, { name: "deleteWorkpool" });

app.use(aggregate, { name: "chatUsage" });
app.use(aggregate, { name: "messageUsage" });
app.use(aggregate, { name: "skillUsage" });
app.use(aggregate, { name: "attachmentUsage" });
app.use(aggregate, { name: "imageAttachmentUsage" });

app.use(rateLimiter, { name: "contentRateLimiter" });

export default app;
