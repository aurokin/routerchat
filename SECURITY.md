# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in RouterChat, please report it privately rather than opening a public issue.

- Open a [private security advisory](https://github.com/aurokin/routerchat/security/advisories/new) on GitHub, or
- Email the maintainers with details of the issue.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce, ideally with a minimal proof of concept
- Affected versions or commits, if known

We aim to acknowledge reports within a few business days. Once a fix is available, we will coordinate disclosure with the reporter.

## Scope

RouterChat is a local-first client. Sensitive data (API keys, chat history) is stored in the user's browser by default and, when enabled, in a self-hosted Convex deployment. Reports about the application code, build pipeline, or default deployment configuration are in scope.

Out-of-scope:

- Issues in third-party services (OpenRouter, Convex, Google OAuth) — please report those upstream.
- Vulnerabilities that require a compromised end-user device or browser extension.
- Findings against forks or modified deployments that are not reproducible against the upstream `main` branch.
