# TrustVault — Architecture & Implementation Write-Up

## 1. What Was Built

TrustVault was engineered specifically around the core mandate: **"the wrong person can never read the file, and you can prove who read it."**

- **Authentication & 3 Roles**: Complete RBAC with `admin`, `owner`, and `viewer` roles, enforced at both API middleware and UI layers. Accounts can be locked out instantly by admins, terminating all active sessions.
- **AES-256-GCM Encrypted Storage**: Uploaded documents are encrypted on disk under server-generated UUIDs with Galois/Counter Mode authenticated encryption. Checksums (SHA-256) are calculated on plaintext and verified prior to decrypted download. Files are stored entirely outside web roots.
- **Per-Document ACL Engine**: Direct, explicit access control list supporting `READ` (download & view) and `EDIT` (update title & metadata) permissions granted to named users.
- **Immediate Revocation**: No caching or JWT permissions. Revoking a permission sets `revokedAt = NOW()` and blocks subsequent file retrieval immediately.
- **HMAC-SHA256 Chained Audit Trail**: Tamper-evident ledger linking every upload, download, view, edit, soft-delete, login, and permission change to its predecessor. Admin verification recomputes the entire chain from genesis to tip to prove zero tampering.
- **Automated Security Test Suite**: 46 automated tests in Vitest covering cross-user access boundaries, permission enforcement, token tampering, immediate revocation, soft-delete shielding, and HMAC chain validation.
- **Full-Featured React Frontend**: Clean UI with 1-click test user switcher, document browser, upload modal, live ACL management, and cryptographic audit inspector.

---

## 2. Our Permission Model in Our Own Words

We adopted a **strict per-document Access Control List (ACL) with zero folder or group inheritance**.

In traditional enterprise document systems, permissions leak because of hierarchical inheritance: an employee given access to a folder to review one contract inadvertently gains access to twenty other confidential files in that directory, including files added months later.

In TrustVault:
- **Every document has an explicit list of granted users**: Each row in `document_permissions` maps `(document_id, user_id, permission_level, revoked_at)`.
- **EDIT implies READ**: An `EDIT` grant permits downloading, viewing, and modifying title/notes. A `READ` grant permits only viewing and downloading.
- **Owners retain exclusive control**: Only the document's creator can grant access or take it away. Admins have system visibility and user lockout capabilities, but cannot silently read documents without an audited grant.
- **Fail Closed & Deny Enumeration**: If an unpermitted user tries to download or inspect a document by ID, the system returns `404 Not Found` rather than `403 Forbidden`, concealing whether the document even exists.

---

## 3. What We Deliberately Did NOT Build (And Why)

1. **No Folder Inheritance or Nested Groups**: Inherited permissions are the single most common cause of unauthorized privilege widening. We deliberately chose per-document ACLs to guarantee deterministic, un-leaked access boundaries.
2. **No Permission Caching (Redis / In-Memory)**: While caching permission checks would save database lookups, any caching layer introduces a propagation lag or invalidation race during revocations. Real-time DB lookup ensures instant revocation.
3. **No Direct Static File URLs / Presigned S3 URLs**: Presigned URLs have a fixed expiry window (e.g. 5–15 minutes) during which access cannot easily be rescinded if an employee is terminated. All downloads stream through the Express API server where authentication and ACL are validated on the fly.
4. **No Automated AI Access Widening**: While AI suggestions can assist owners, machine intelligence is never allowed to widen or assign permissions autonomously. Every grant requires human confirmation and is recorded in the HMAC audit trail.

---

## 4. How We Used AI and Where It Was Confidently Wrong

We used AI as an accelerator for scaffolding, boilerplate generation, and schema design. However, close inspection caught several critical security bugs:

1. **Stale Permissions in JWTs**: The AI initially recommended embedding document permission arrays inside the user's JWT to "minimize database hits". We caught this immediately: if a permission is revoked on the server, a user holding a 1-hour JWT would still be able to access the file until token expiration. We rejected this and kept the JWT identity-only.
2. **Unchained Audit Logs**: The AI initially provided an audit table with plain `SHA256(entry)` hashes. Anyone with direct database access could alter an audit record and re-hash that individual row without detection. We replaced this with an HMAC-SHA256 blockchain where each record includes `previousHash` signed with a server secret.
3. **ID Enumeration via 403 Forbidden**: The AI initially returned `403 Forbidden` on unauthorized document access. This acts as an information oracle confirming that the document ID exists. We corrected this to return a clean `404 Not Found`.
4. **AES-CBC Without Integrity**: The AI initially suggested AES-CBC encryption with original filenames on disk. We switched to authenticated AES-256-GCM under random UUIDs to prevent padding oracle attacks and path traversal.

All 5 detailed entries with prompts, critique, and remediation commits are documented in [PROMPTS.md](./PROMPTS.md).

---

## 5. What Is Unfinished / Known Limitations

1. **Single Master Encryption Key**: All documents currently share one AES-256 master key defined in environment configuration. A multi-tenant production system should implement envelope encryption (a unique Data Encryption Key per document wrapped by a Key Management Service / HSM).
2. **Storage Exhaustion Quotas**: While individual uploads are capped at 50MB with rate limiting, per-user storage quotas are not yet enforced.
3. **File Magic Byte Validation**: Multer inspects client-reported MIME types and extensions. In production, binary file signature inspection (magic bytes) should be added to prevent disguised binaries.
4. **Audit Off-Site Replication**: The HMAC chain detects tampering inside the database, but a root attacker who wipes the entire database and secret key could destroy the record. Production systems should stream audit hashes to write-once storage (AWS S3 Object Lock / WORM).
