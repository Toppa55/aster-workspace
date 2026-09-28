# Security policy

Please report vulnerabilities privately to the repository owner instead of opening a public issue.

## Deployment checklist

- Generate a unique `APP_ENCRYPTION_KEY` for every installation.
- Store the key in the deployment platform's secret manager.
- Keep the application behind authenticated, encrypted HTTPS access.
- Restrict D1 and R2 bindings to this Worker.
- Rotate provider keys immediately if exposure is suspected.
- Do not enable request-body logging on AI, provider, upload, or export routes.
- Review dependency and secret-scanning alerts before every release.

Provider credentials are excluded from exports. Treat database backups, R2 objects, and the installation encryption key as sensitive data.
