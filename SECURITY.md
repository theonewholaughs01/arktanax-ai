# Security policy

## Reporting a vulnerability

Please do not publish suspected credentials, security vulnerabilities, or private user information in a public issue. Contact the repository owner privately through their GitHub profile with a concise description and enough detail to reproduce the concern safely.

## Source-release expectations

Before sharing this repository publicly, maintainers should confirm that no local credentials, session secrets, database connection values, uploaded files, logs, or user records are tracked in Git.

The project expects runtime values to be provided through the deployment environment. Source files may reference configuration-variable **names**, but must never include their values.

## Scope limits

This repository is an application source project, not a production security guarantee. Any public deployment should use its platform’s supported authentication, secure secret management, access controls, and database protections. Review those deployment settings independently before inviting users.
