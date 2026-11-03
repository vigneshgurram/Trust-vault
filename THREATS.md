# THREATS.md — TrustVault Threat Model

This document lists the ways TrustVault could be broken, what we did about each one, and which ones we knowingly accepted.

---

## T1. Direct Object Reference — Guessing Document IDs

**Threat**: An attacker who knows or guesses a document's UUID could access it by constructing a URL like `/api/documents/<uuid>/download`.

**Mitigation**: Every document endpoint checks permissions against the database before serving content. The server returns 404 (not 403) for unauthorized access, preventing ID enumeration — an attacker cannot distinguish "this document doesn't exist" from "you don't have access."

**Tests**: `authorization.test.ts` — "ID enumeration prevention" section.

**Residual risk**: UUIDs are 128-bit random, so brute-force is impractical. However, if a document ID leaks (e.g., in a URL shared via chat), anyone with it knows a valid ID. The permission check still prevents access, but the ID itself is information.

---

## T2. JWT Token Theft

**Threat**: If an attacker obtains a valid JWT (via XSS, network sniffing, or stolen device), they can impersonate the user.

**Mitigation**:
- JWT tokens expire after 15 minutes
- Tokens are sent via Authorization header (not cookies), reducing CSRF risk
- Helmet sets security headers including Content-Security-Policy
- The server checks that the user is still active on every request, so disabling the account immediately invalidates all their tokens

**Residual risk**: A stolen token is valid for up to 15 minutes. We do not implement a server-side token blacklist (which would be needed for instant invalidation of a specific token). We accepted this because the permission check on every request means a revoked permission takes effect immediately regardless of token validity.

---

## T3. Permission Caching Bypass

**Threat**: If permissions are cached (in memory, Redis, or in the JWT), revoking access might not take effect immediately.

**Mitigation**: **No permission caching at all.** Every request queries the database for the active permission row. JWT carries only identity (user_id, role), never permission grants. This is a deliberate performance trade-off: one DB query per request, but revocation is immediate.

**Tests**: `authorization.test.ts` — "viewer1 CANNOT read document AFTER permission is revoked" test specifically grants, verifies access, revokes, and verifies denial in sequence.

---

## T4. Audit Trail Tampering

**Threat**: An attacker (or malicious DBA) modifies or deletes audit log entries to cover their tracks.

**Mitigation**: HMAC-chained audit trail. Each entry's hash is `HMAC(secret, serialize(entry + previous_hash))`. Altering any entry changes its hash, which breaks the chain from that point forward. The admin can verify chain integrity at any time via `/api/audit/verify`.

**Tests**: `audit.test.ts` — "detects chain tampering" test directly modifies a DB record and verifies the chain reports as broken.

**Residual risk**:
- The HMAC secret is stored as an environment variable. If an attacker obtains it, they could recompute the entire chain after tampering. Mitigation: In production, use a Hardware Security Module (HSM) or Key Management Service.
- A sophisticated attacker could delete all entries and rebuild the chain from scratch. Mitigation: Periodic off-site backups of audit hashes, or streaming audit entries to a write-once external service.
- The append-only constraint is enforced by application logic, not by the database engine. A direct SQL UPDATE or DELETE would succeed. Mitigation: Database user permissions should be restricted to INSERT-only on the audit table in production.

---

## T5. File Path Traversal

**Threat**: An attacker manipulates file paths to read or write files outside the upload directory.

**Mitigation**: Files are stored with server-generated UUID filenames only. The original filename is stored in the database but never used in file system operations. The file path in the response is always stripped (`filePath: undefined`).

**Tests**: Document responses are checked to ensure `filePath` and `encryptionIv` are never exposed.

---

## T6. Privilege Escalation via Role Manipulation

**Threat**: A user changes their own role (e.g., from viewer to admin) by modifying the JWT or API request.

**Mitigation**:
- JWT is signed with a server-side secret; tampering invalidates the signature
- The role in the JWT is verified against the database on every request
- User management endpoints require admin role
- There is no self-service role change endpoint

**Tests**: `auth.test.ts` — "should reject expired or tampered JWT" test creates a JWT with a wrong secret and verifies rejection.

---

## T7. Encryption Key Exposure

**Threat**: If the AES-256 encryption key is compromised, all files can be decrypted.

**Mitigation**: Key is stored as an environment variable, not in code or database. Files are encrypted with AES-256-GCM which provides both confidentiality and integrity (authentication tag).

**Residual risk**: All files share one encryption key. A per-document key would limit the blast radius but adds key management complexity. We accepted this trade-off for v1. In production, use AWS KMS or Azure Key Vault with per-document data keys.

---

## T8. SQL Injection

**Threat**: Malicious input in search queries or form fields could execute arbitrary SQL.

**Mitigation**: All database queries go through Prisma ORM, which uses parameterized queries. No raw SQL is used anywhere in the codebase. Input validation via Zod schemas rejects unexpected input before it reaches the ORM.

---

## T9. Unauthorized File Upload (Content-Type Spoofing)

**Threat**: An attacker uploads a malicious file (e.g., executable disguised as PDF) by setting a fake MIME type.

**Mitigation**: MIME type is checked against an allowlist in the multer configuration. File size is capped at 50MB.

**Residual risk**: We validate the MIME type header from the client but do not inspect file magic bytes (file signature). A determined attacker could upload a file with valid PDF MIME type but executable content. For production, add magic byte validation (e.g., with the `file-type` library).

---

## T10. Denial of Service via Large Uploads

**Threat**: An attacker floods the server with large file uploads to exhaust disk space or memory.

**Mitigation**: Multer enforces a 50MB file size limit. Rate limiting (100 requests/minute general, 20/15min for auth) reduces throughput. Files are stored in a dedicated upload directory that can be monitored.

**Residual risk**: A sustained attack with many files at the maximum size could still fill the disk. Production mitigation: disk space monitoring, per-user upload quotas, and cloud storage with provisioned limits.

---

## T11. Admin Implicit Document Access

**Threat**: An admin can see all documents in the listing endpoint, potentially reading documents they shouldn't.

**Design decision**: Admins can see document metadata (titles, owners) in listings for operational purposes, but reading document content requires the same permission check as any other user. An admin who accesses a document they're not granted will see 404. An admin who grants themselves access will be recorded in the audit trail.

**What we deliberately chose**: Admin CAN view all documents in the listing endpoint (metadata only) for system oversight. This is a trade-off: full admin lockout makes the system harder to administer; full admin access defeats per-document permissions. We chose metadata-only visibility. Document content (download) still requires explicit permission.

---

## T12. Cross-Site Request Forgery (CSRF)

**Threat**: An attacker's page makes authenticated requests to TrustVault using the victim's credentials.

**Mitigation**: Authentication uses Bearer tokens in the Authorization header, not cookies. CORS is restricted to the frontend origin. This makes CSRF impractical because the attacker's page cannot set the Authorization header on cross-origin requests.

---

## T13. Mass Permission Grant

**Threat**: A compromised owner account grants READ access to all documents to an attacker's account before detection.

**Mitigation**: Every permission change is individually logged in the audit trail with the granter's identity, the grantee, and the document. The admin dashboard shows recent permission changes. Bulk anomalous grants would be visible.

**Residual risk**: There is no automated anomaly detection. A human must notice. For production: add alerts for unusual permission patterns (e.g., more than N grants in M minutes).

---

## T14. Session Fixation / Token Reuse

**Threat**: Tokens can be reused across devices if stolen.

**Residual risk**: We do not bind tokens to a specific device or IP. Adding device fingerprinting or IP binding would reduce this risk but causes usability issues (e.g., mobile users changing networks). We accepted this given the 15-minute token lifetime.

---

## T15. Deleted Document Recovery

**Threat**: Soft-deleted documents remain on disk and in the database. An attacker with database access could un-delete them.

**Mitigation**: The `deletedAt` timestamp is checked on every access path. All permissions are revoked on deletion. The encrypted file remains on disk (for potential recovery by owner request).

**Residual risk**: The file is not physically deleted. For compliance, add a scheduled hard-delete process that removes files after a retention period. This is noted as unbuilt.

---

## What We Know Is Weak And Left

1. **Single encryption key for all files** — A per-document key envelope would be better. Left for v1 simplicity.
2. **No magic byte validation on uploads** — We check MIME type but not file signatures. Left because it requires additional library and testing.
3. **No multi-factor authentication** — Single-factor (password) only. Left because MFA integration is substantial and orthogonal to the permission model.
4. **No external audit log replication** — The audit chain is tamper-evident but not tamper-proof against someone who controls both the database and the HMAC secret. Left because it requires external infrastructure.
5. **No per-user upload quotas** — Storage exhaustion is possible. Left because it's an operational concern rather than an access control issue.
6. **SQLite in production** — SQLite doesn't support row-level security or INSERT-only constraints. The audit table's append-only property is enforced in application code. For production, PostgreSQL with restricted database user permissions would be stronger.
