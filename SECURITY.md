# Security Policy

## Data protection

This repository must not contain private member records, assist histories, moderation notes, staff-only exports, Discord bot tokens, webhook URLs, Supabase service-role keys, database passwords, or other privileged credentials.

Keep sensitive logic and data in a private backend. Public browser code may contain only intentionally public/publishable values, protected by server-side authorization and database policies.

## Dashboard access gate

The dashboard includes a client-side password gate for normal community access. The password itself is not stored in plain text; the browser compares a SHA-256 digest and the dashboard delays its Supabase requests until access is granted.

Because this repository and GitHub Pages deployment are public, the gate is not a replacement for server-side authentication. A determined technical user can inspect or modify client code. Sensitive data must therefore remain protected with Supabase Row Level Security, server-side authorization, or a private backend regardless of the dashboard gate.

## If a secret is exposed

Revoke or rotate it immediately. Removing it from the latest files is not enough because older commits and branches may retain it.

## Reporting

Report suspected exposure privately to the repository owner. Do not post credentials or member data in public issues.
