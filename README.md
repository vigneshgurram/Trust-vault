# TrustVault — Secure Document Sharing Platform

> A document platform where the wrong person can never read the file, and you can prove who read it.

## Overview

TrustVault is a secure document management system built for organisations that share confidential documents: salary letters, contracts, audit papers, regulatory filings. It solves two problems that are expensive when they go wrong:

1. **Permissions** — Someone is given access to one file and can see forty. TrustVault enforces per-document grants. No folders, no inheritance, no accidental widening.

2. **Audit** — When a document leaks, the first question is "who opened this, and when?" TrustVault's HMAC-chained audit trail can answer that, and you can prove the answer hasn't been altered.

## Quick Start

### Prerequisites
- Node.js 20+ and npm
- Git

### Setup
```bash
# Clone and install
git clone <repo-url>
cd trustvault

# Backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed

# Frontend (in a new terminal)
cd frontend
npm install
```

### Run
```bash
# Backend (from /backend)
npm run dev

# Frontend (from /frontend)
npm run dev
```

The API runs on `http://localhost:3001` and the frontend on `http://localhost:5173`.

## Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@trustvault.com | Admin@123456 |
| **Owner** | owner@trustvault.com | Owner@123456 |
| **Owner 2** | owner2@trustvault.com | Owner2@123456 |
| **Viewer** | viewer@trustvault.com | Viewer@123456 |
| **Viewer 2** | viewer2@trustvault.com | Viewer2@123456 |

## Architecture

### Stack
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + TypeScript + Vite
- **Database**: SQLite via Prisma ORM
- **File Storage**: AES-256-GCM encrypted files on disk
- **Auth**: JWT (15-minute expiry) with server-side permission checks

### Security Design

1. **Per-document ACL** — No folders, no groups, no inheritance. Every permission is an explicit grant to a named user on a specific document. EDIT implies READ.

2. **Server-side enforcement** — JWT carries identity only (user ID, role). Every request checks permissions against the database in real time. No permission caching.

3. **Immediate revocation** — When access is revoked, the permission row is timestamped. The next request by that user is denied. No token invalidation delay.

4. **HMAC-chained audit trail** — Every action (upload, download, view, edit, delete, permission grant/revoke, login, failed login) is logged. Each entry's hash includes the previous entry's hash, so tampering with any entry breaks the chain.

5. **Files encrypted at rest** — AES-256-GCM. Files stored under random UUID names outside the web root. No direct URL access.

6. **Defense in depth** — Helmet security headers, CORS restriction, rate limiting, input validation (Zod), bcrypt password hashing (cost 12), path traversal prevention.

### Role Model

| Role | Capabilities |
|------|-------------|
| **Admin** | Manage users, view all audit logs, verify audit chain, view system dashboard. Cannot read documents unless explicitly granted |
| **Owner** | Upload documents, grant/revoke per-document access, edit/delete own documents, view audit trail for own documents |
| **Viewer** | Read/download documents they've been granted access to, edit documents with EDIT permission. Cannot upload, cannot grant permissions |

## Running Tests

```bash
cd backend
npm test
```

The test suite includes:
- Authentication tests (login, token validation, disabled accounts)
- **Authorization tests** (cross-user access prevention, permission enforcement, immediate revocation)
- Audit trail tests (logging, HMAC chain integrity, tamper detection)

## Project Structure

```
trustvault/
├── backend/
│   ├── src/
│   │   ├── middleware/     # auth, permissions, audit, validation
│   │   ├── routes/         # auth, documents, permissions, audit, admin
│   │   ├── services/       # encryption, audit-chain
│   │   ├── prisma/         # schema, seed
│   │   └── tests/          # authorization, audit, auth tests
│   ├── prisma/             # schema.prisma
│   └── uploads/            # encrypted files (gitignored)
├── frontend/
│   └── src/                # React application
├── THREATS.md              # Threat model
├── PROMPTS.md              # AI usage log
├── API.md                  # API documentation
└── README.md               # This file
```

## Key Files
- [THREATS.md](./THREATS.md) — Threat model: what could break, what we did, what we accepted
- [PROMPTS.md](./PROMPTS.md) — AI usage log with corrections
- [API.md](./API.md) — API endpoint documentation with access control
