import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { parseEnvArg, readArgValue, repoRootPath } from "./lib";

const runBunScript = (args: { script: string; argv: string[] }): void => {
    const result = spawnSync(
        "bun",
        ["run", args.script, "--", ...args.argv],
        {
            cwd: repoRootPath(),
            stdio: "inherit",
            env: process.env,
        },
    );

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(
            `Failed: bun run ${args.script} -- ${args.argv.join(" ")} (exit ${result.status ?? "unknown"})`,
        );
    }
};

const main = (): void => {
    const envName = parseEnvArg(process.argv);
    const allowProcessEnv = process.argv.includes("--allow-process-env");
    const allowDisableCsp = process.argv.includes("--allow-disable-csp");
    const validate = process.argv.includes("--validate");

    const deploymentArg = readArgValue(process.argv, "--deployment");
    const deploymentNameArg = readArgValue(process.argv, "--deployment-name");
    const serviceArg = readArgValue(process.argv, "--service");
    const railwayEnvArg = readArgValue(process.argv, "--railway-env");

    const convexSecretsFile = repoRootPath(`.env.convex.${envName}.local`);
    const railwaySecretsFile = repoRootPath(`.env.railway.${envName}.local`);

    const wantsConvex = fs.existsSync(convexSecretsFile) || allowProcessEnv;
    const wantsRailway = fs.existsSync(railwaySecretsFile) || allowProcessEnv;

    const convexArgs: string[] = ["--env", envName];
    if (allowProcessEnv) convexArgs.push("--allow-process-env");
    if (deploymentArg) convexArgs.push("--deployment", deploymentArg);
    if (deploymentNameArg)
        convexArgs.push("--deployment-name", deploymentNameArg);

    const railwayArgs: string[] = ["--env", envName];
    if (allowProcessEnv) railwayArgs.push("--allow-process-env");
    if (allowDisableCsp) railwayArgs.push("--allow-disable-csp");
    if (serviceArg) railwayArgs.push("--service", serviceArg);
    if (railwayEnvArg) railwayArgs.push("--railway-env", railwayEnvArg);

    const tasks: Array<{ label: string; script: string; argv: string[] }> = [];

    if (wantsRailway) {
        tasks.push({
            label: "Railway vars (.env.railway.*.local)",
            script: "railway:env",
            argv: railwayArgs,
        });
    }

    if (wantsConvex) {
        tasks.push({
            label: "Convex vars (.env.convex.*.local)",
            script: "convex:env",
            argv: convexArgs,
        });
    }

    if (tasks.length === 0) {
        throw new Error(
            [
                "Nothing to apply.",
                "Create one or more of these files and re-run:",
                `- ${convexSecretsFile}`,
                `- ${railwaySecretsFile}`,
                "",
                "Or pass --allow-process-env to source values from your shell/CI env (not recommended for local runs).",
            ].join("\n"),
        );
    }

    console.log(`Applying environment wiring for ${envName}...`);

    if (validate) {
        const validateArgs: string[] = ["--env", envName];
        if (allowProcessEnv) validateArgs.push("--allow-process-env");
        if (allowDisableCsp) validateArgs.push("--allow-disable-csp");

        console.log("");
        console.log("==> Environment validation (preflight)");
        runBunScript({ script: "env:validate", argv: validateArgs });
    }

    for (const task of tasks) {
        console.log("");
        console.log(`==> ${task.label}`);
        runBunScript({
            script: task.script,
            argv: task.argv,
        });
    }

    console.log("");
    console.log("All done.");
};

try {
    main();
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
}
