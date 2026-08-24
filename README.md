# ARKTANAX

ARKTANAX is a personal AI workspace for persistent, text-first conversations, structured code and file review, and optional microphone **transcription** into the message composer. It is built as a private-by-default personal project and is intentionally explicit about its operating limits.

> **Text first:** ARKTANAX displays assistant replies as text. It does not use browser text-to-speech or read responses aloud.

## What it includes

| Capability | Description |
| --- | --- |
| Persistent conversations | User-scoped threads and messages are retained through the application backend. |
| Operating modes | Fast, Deep, and Code modes shape the response approach. |
| Personal profile | Private preferences can guide response detail, focus areas, and working style. |
| File workspace | Text, source, and PDF files can be attached for bounded analysis. |
| Microphone transcription | Hold-to-dictate records a prompt and transcribes it into editable text; it does not produce spoken assistant output. |
| Source-aware behavior | The interface clearly separates supported features from deferred integrations. |

## Important boundaries

ARKTANAX is a personal workspace, not an autonomous device-control system. It does **not** execute arbitrary code, access external services on a user’s behalf, or claim background automation unless an explicitly configured integration is added.

Uploaded-file analysis is intentionally bounded by supported file types and size limits. Do not submit passwords, API keys, private credentials, or regulated personal data through any demonstration deployment.

## Local development

This repository uses a React, TypeScript, Express, tRPC, and database-backed template.

```bash
pnpm install
pnpm dev
```

Run the validation suite with:

```bash
pnpm test
pnpm check
```

The application requires platform-provided runtime configuration for authentication, database access, and its built-in service gateway. **Do not commit credential values.** Configuration is supplied through the deployment environment, not source files.

## Required runtime configuration

The following names are referenced by the application or its platform template. Their values must remain private and must be configured in the deployment environment:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Database connection for user-scoped persistence. |
| `JWT_SECRET` | Session-cookie signing secret. |
| `VITE_APP_ID` | Application identifier used by the authentication flow. |
| `OAUTH_SERVER_URL` | Authentication service endpoint. |
| `OWNER_OPEN_ID` | Project-owner identifier. |
| `BUILT_IN_FORGE_API_URL` | Built-in platform service gateway endpoint. |
| `BUILT_IN_FORGE_API_KEY` | Server-side gateway credential. |

## Repository safety

Local configuration files, runtime artifacts, logs, and internal task notes are excluded from version control. See [SECURITY.md](SECURITY.md) for reporting guidance and public-release expectations.

## License

No open-source license has been granted yet. Until a license is added, the source is shared for viewing and evaluation only; reuse, modification, or redistribution is not automatically permitted.
