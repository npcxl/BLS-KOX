# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅ |

## Reporting a Vulnerability

**DO NOT** create a public GitHub Issue for security vulnerabilities.

Instead, use GitHub's [Private Vulnerability Reporting](https://github.com/npcxl/BLS-KOX/security/advisories/new) or contact the maintainers privately.

### Response Process

1. Acknowledge receipt within 48 hours.
2. Validate and assess severity.
3. Release a fix as soon as practical.
4. Publish an advisory after the fix is released.

## Security Requirements

### Production Deployment Checklist

1. **Change default admin password** (`superadmin / 123456` is for local demos only)
2. Set strong `JWT_SECRET` (minimum 32 characters, random)
3. Set strong `DB_PASSWORD` and `REDIS_PASSWORD`
4. Enable HTTPS in production
5. Do not expose MySQL/Redis ports to the public internet
6. Keep `CORS_ORIGINS` restricted to your domain
7. Run `npm run db:migrate up` after each upgrade

### Default Account Warning

The default `superadmin / 123456` account exists **for local development and demo purposes only**. You **MUST** change this password before deploying to production.
