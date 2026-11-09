# TrustVault — Secure Document Sharing Platform

> A document platform where the wrong person can never read the file, and you can prove who read it.

## Overview

TrustVault is an enterprise document security system built for organisations that share confidential documents (salary letters, contracts, blueprints, regulatory filings, audit papers).

It solves two expensive problems:
1. **Permissions**: Someone is given access to a folder to see one file and can now see forty. TrustVault implements strict **per-document ACL grants with zero folder or group inheritance**.
2. **Audit Evidence**: When a document leaks, who opened it and when? TrustVault provides an **HMAC-SHA256 cryptographically chained audit blockchain** where any tampering breaks the verification chain from that point forward.

---

## Tech Stack (Option B: Django + DRF + PostgreSQL)

- **Backend**: Python 3.12, Django 5.1+, Django REST Framework (DRF)
- **Production Server**: Gunicorn + WhiteNoise (Brotli static compression)
- **Database**: PostgreSQL on Render (falls back to SQLite for local development)
- **Frontend**: Bootstrap 5.3 + Bootstrap Icons (responsive cybersecurity theme)
- **Cryptography**: AES-256-GCM authenticated encryption at rest via `cryptography`
- **Audit Ledger**: HMAC-SHA256 mathematical blockchain
- **Deployment**: Render Web Service + Managed PostgreSQL

---

## Demo Credentials (Seeded Automatically)

| Role | Username | Email | Password | Permissions & Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin@trustvault.com` | `Admin@123456` | Full system oversight, user lockout, global audit ledger, HMAC verification |
| **Owner 1** | `owner` | `owner@trustvault.com` | `Owner@123456` | Uploads encrypted documents, grants/revokes permissions to other users |
| **Owner 2** | `owner2` | `owner2@trustvault.com` | `Owner2@123456` | Separate owner (verifies cross-user isolation: cannot see Owner 1's files) |
| **Viewer 1** | `viewer` | `viewer@trustvault.com` | `Viewer@123456` | Can view and download files explicitly granted to them |
| **Viewer 2** | `viewer2` | `viewer2@trustvault.com` | `Viewer2@123456` | Unshared user (shows an empty vault) |
| **Disabled** | `disabled` | `disabled@trustvault.com` | `Disabled@123456` | Locked-out account (verifies immediate authentication rejection) |

---

## Local Development & Testing

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run database migrations
python manage.py migrate

# 3. Seed initial users & roles
python manage.py seed_data

# 4. Run automated security test suite
python manage.py test

# 5. Start development server
python manage.py runserver
```
App runs at: `http://127.0.0.1:8000/`

---

## Deploying to Render (Step-by-Step)

### Option 1: Render Blueprint (Easiest - 1 Click)
1. Go to **[render.com](https://render.com)** -> Click **New +** -> **Blueprint**.
2. Connect your `Trust-vault` repository.
3. Render automatically detects `render.yaml`, provisions a **PostgreSQL Database** (`trustvault-db`) and a **Web Service** (`trustvault-web`), runs `build.sh`, applies migrations, and seeds users!

### Option 2: Manual Web Service Setup
1. **Create PostgreSQL Database** on Render:
   - Name: `trustvault-db`
   - Plan: **Free**
   - Copy the **Internal Database URL**.
2. **Create Web Service** on Render:
   - Connect repo: `vigneshgurram/Trust-vault`
   - Runtime: `Python`
   - Build Command: `./build.sh`
   - Start Command: `gunicorn trustvault.wsgi:application`
   - Add Environment Variables:
     - `DATABASE_URL` = *(Internal Database URL from step 1)*
     - `SECRET_KEY` = *(click Generate)*
     - `DEBUG` = `False`
     - `AUDIT_HMAC_SECRET` = *(click Generate)*
     - `ENCRYPTION_KEY` = `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`
     - `ALLOWED_HOSTS` = `*`
3. Click **Deploy Web Service**.

---

## Core Security Guarantees Tested

1. **Strict Server-Side Authorization**: Every document access is validated against the database. No client-side bypasses.
2. **Denial of ID Enumeration**: Unauthorized requests return `404 Not Found` (never 403), concealing whether a document UUID exists.
3. **Immediate Revocation**: No caching or session delay. Revoking an ACL grant takes effect on the next millisecond.
4. **Tamper-Evident HMAC Audit Blockchain**: Altering any historical log row breaks the verification chain from that entry forward.
5. **AES-256-GCM Storage**: Files are encrypted before being written to disk under random UUIDs. Plaintext SHA-256 checksum is verified upon download.
