import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
    isMissingSecret,
    loadDotEnvIfExists,
    mergeEnv,
    parseEnvArg,
    readArgValue,
    repoRootPath,
} from "./lib";

const runRailwayVarSet = (args: {
    service: string;
    railwayEnv: string;
    name: string;
    value: string;
}): void => {
    // Use stdin so values don't end up in shell history or process args.
    const result = spawnSync(
        "bunx",
        [
            "@railway/cli",
            "variable",
            "set",
            "--service",
            args.service,
            "--environment",
            args.railwayEnv,
            args.name,
            "--stdin",
        ],
        {
            cwd: repoRootPath(),
            input: args.value,
            stdio: ["pipe", "inherit", "inherit"],
            env: process.env,
        },
    );

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(
            `Failed to set Railway env var ${args.name} (exit ${result.status ?? "unknown"})`,
        );
    }
};

const main = (): void => {
    const envName = parseEnvArg(process.argv);

    const allowProcessEnv = process.argv.includes("--allow-process-env");
    const allowDisableCsp = process.argv.includes("--allow-disable-csp");
    const absSecretsFile = repoRootPath(`.env.railway.${envName}.local`);
    const secretsFileEnv = loadDotEnvIfExists(absSecretsFile);

    if (!allowProcessEnv && !fs.existsSync(absSecretsFile)) {
        throw new Error(
            `Missing ${absSecretsFile}. Create it and re-run (see docs/deploy/railway.md).`,
        );
    }

    const env = allowProcessEnv ? mergeEnv(process.env, secretsFileEnv) : secretsFileEnv;

    const defaultService =
        envName === "preview"
            ? "routerchat-web-preview"
            : envName === "prod"
              ? "routerchat-web"
              : undefined;
    const defaultRailwayEnv =
        envName === "preview"
            ? "preview"
            : envName === "prod"
              ? "production"
              : undefined;

    const service =
        readArgValue(process.argv, "--service") ??
        env.RAILWAY_SERVICE?.trim() ??
        defaultService;
    const railwayEnv =
        readArgValue(process.argv, "--railway-env") ??
        env.RAILWAY_ENVIRONMENT?.trim() ??
        env.RAILWAY_ENV?.trim() ??
        defaultRailwayEnv;

    if (!service) {
        throw new Error(
            "Missing Railway service. Pass --service <name> or set RAILWAY_SERVICE=... in the env file.",
        );
    }
    if (!railwayEnv) {
        throw new Error(
            "Missing Railway environment. Pass --railway-env <name> or set RAILWAY_ENV=... in the env file.",
        );
    }

    const entriesToSet = Object.entries(env)
        .filter(([k]) => !k.startsWith("RAILWAY_"))
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, (v ?? "").trim()] as const)
        .filter(([, v]) => v.length > 0);

    if (entriesToSet.length === 0) {
        throw new Error(
            `No Railway vars found in ${absSecretsFile}. Add at least one KEY=VALUE line and re-run.`,
        );
    }

    const disableCsp = env.DISABLE_CSP?.trim().toLowerCase() === "true";
    if (disableCsp) {
        if (envName === "prod") {
            throw new Error(
                "Refusing to set DISABLE_CSP=true in prod. Remove it from the env file/Railway vars.",
            );
        }
        if (envName === "preview" && !allowDisableCsp) {
            throw new Error(
                "DISABLE_CSP=true is set in preview. Remove it (recommended) or re-run with --allow-disable-csp (debug only).",
            );
        }
        console.warn(
            "warning: DISABLE_CSP=true is set. This disables CSP (debug only); remove it after troubleshooting.",
        );
    }

    for (const [name, value] of entriesToSet) {
        if (isMissingSecret(value)) {
            throw new Error(
                `Refusing to set ${name}: value looks missing/placeholder. Fix ${absSecretsFile} and re-run.`,
            );
        }
    }

    console.log(
        `Setting Railway vars from ${absSecretsFile} on ${service} (${railwayEnv})...`,
    );

    for (const [name, value] of entriesToSet) {
        runRailwayVarSet({
            service,
            railwayEnv,
            name,
            value,
        });
    }

    console.log("Done.");
};

try {
    main();
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
}
