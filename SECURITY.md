# Security Policy

## Data protection

This repository must not contain private member records, assist histories, moderation notes, staff-only exports, Discord bot tokens, webhook URLs, Supabase service-role keys, database passwords, or other privileged credentials.

Keep sensitive logic and data in a private backend. Public browser code may contain only intentionally public/publishable values, protected by server-side authorization and database policies.

## If a secret is exposed

Revoke or rotate it immediately. Removing it from the latest files is not enough because older commits and branches may retain it.

## Reporting

Report suspected exposure privately to the repository owner. Do not post credentials or member data in public issues.
