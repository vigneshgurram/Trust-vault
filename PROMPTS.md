# PROMPTS.md — AI Interaction & Architectural Log

This log documents the iterative prompts provided to AI tools during the development of TrustVault, the outputs generated, architectural and security flaws identified upon inspection, and the concrete remediation implemented in code.

---

### Reused Context & Instructions Across Sessions

The following system constraints were enforced across all generation prompts:
- **Zero-Trust File Access**: The server is the sole arbiter of access. Never rely on client-side state or JWT-embedded permissions.
- **Fail Closed & Deny Enumeration**: Unauthorized requests must yield generic 404 responses rather than 403 to prevent object existence enumeration.
- **HMAC Chaining for Audit Logs**: Every audit log record must be mathematically tied to its predecessor using HMAC-SHA256.
- **Immediate Revocation**: No TTL or cache window for permission grants. Real-time DB lookup on every request.

---

### Entry 1 — 2026-11-03: Authorization & Token Architecture

**1. Prompt:**
> "Design the authentication and authorization mechanism for TrustVault. How should user permissions for documents be encoded in the JWT to make API requests fast and avoid hitting the database on every file download?"

**2. What it produced:**
The AI proposed embedding an array of permitted document IDs and permission levels inside the JWT payload (e.g. `permissions: [{ docId: '...', role: 'READ' }]`), signing the token with an expiration of 1 hour, and creating a middleware that only inspected `req.jwt.permissions`.

**3. What was wrong with it:**
- **Fatal Access Revocation Flaw**: Violates Core Requirement 3 ("Taking access away works immediately. Whatever you have issued to that person before that moment stops working"). If permissions are embedded in a 1-hour JWT, revoking a user's access on the server has zero effect until token expiration unless a distributed blacklist is maintained.
- **Privilege Widening**: If a document is updated or re-shared, the user's stale JWT token cannot reflect changes.
- **JWT Bloat**: As a user is granted access to hundreds of files, the token header size exceeds standard HTTP server limits (431 Request Header Fields Too Large).

**4. What was done instead:**
We rejected embedding document permissions in JWT entirely. JWT in TrustVault carries **identity only** (`userId`, `email`, `role`). Authorization is checked against the database in real-time on every single request in `src/middleware/permissions.ts`. When an owner revokes access by setting `revokedAt = NOW()`, subsequent requests from that user immediately fail on the next millisecond.

*Code Reference*: [src/middleware/permissions.ts](file:///c:/Trust%20vault/backend/src/middleware/permissions.ts#L10-L40), [src/middleware/auth.ts](file:///c:/Trust%20vault/backend/src/middleware/auth.ts#L42-L60)

---

### Entry 2 — 2026-11-03: Audit Trail Tamper Evidence & Cryptographic Chaining

**1. Prompt:**
> "Implement the audit logging service for tracking uploads, downloads, views, and permission modifications. Ensure the audit trail is verifiable and cannot be silently manipulated by someone with database access."

**2. What it produced:**
The AI generated a standard database table with columns `id`, `action`, `timestamp`, `userId`, `details`, and an `audit_hash` column calculated as `SHA256(id + action + timestamp)`. It included a verify script that re-hashed each individual row and compared it to `audit_hash`.

**3. What was wrong with it:**
- **No Chain of Custody**: Because each hash was computed independently for each row, a malicious actor or insider with database write privileges could alter a row and simply recompute `SHA256(id + action + timestamp)` for that row. The verify script would report valid!
- **Deletion Vulnerability**: Entire rows could be deleted without leaving any cryptographic gap or proof of missing sequence.
- **Unkeyed Hash**: Plain SHA-256 lacks an authentication secret; any attacker who knows the hashing format can forge entries.

**4. What was done instead:**
We redesigned the audit subsystem into an **HMAC-SHA256 cryptographic blockchain**:
1. Every record includes `previousHash` (referencing the parent log entry) and an autoincrementing `sequenceNumber`.
2. The `entryHash` is computed with a server-held secret: `HMAC_SHA256(secret, serialize(entry + previousHash))`.
3. Tampering with any historical entry, deleting an entry, or altering the sequence breaks the chain for all subsequent entries.
4. Added `/api/audit/verify` which iterates the entire sequence from genesis to tip to prove unbroken integrity.

*Code Reference*: [src/services/audit.ts](file:///c:/Trust%20vault/backend/src/services/audit.ts#L30-L120), [src/tests/audit.test.ts](file:///c:/Trust%20vault/backend/src/tests/audit.test.ts#L125-L165)

---

### Entry 3 — 2026-11-03: Information Leakage & ID Enumeration Prevention

**1. Prompt:**
> "Write the Express route handler for GET /api/documents/:id and GET /api/documents/:id/download. Return appropriate HTTP error status codes when authorization fails."

**2. What it produced:**
The AI generated logic that first queried `prisma.document.findUnique({ where: { id } })`. If not found, it returned `404 Not Found`. If found, it checked user permissions. If permission was denied, it returned `403 Forbidden` with `{ error: "You do not have permission to view this document" }`.

**3. What was wrong with it:**
- **Information Oracle (ID Enumeration)**: Returning `403 Forbidden` confirms to an unauthorized user or attacker that the requested document UUID exists in the vault. An attacker scanning UUIDs or testing intercepted IDs can confirm the existence of confidential deals, mergers, or employee records.
- **Metadata Leakage**: In the document listing endpoint, the AI originally returned `filePath` on disk and the AES initialization vector `encryptionIv`.

**4. What was done instead:**
- Standardized authorization failures to return a strict `404 Not Found` with `{ error: 'Document not found' }`, indistinguishable from non-existent resources.
- Explicitly sanitized responses to strip internal storage paths (`filePath: undefined`) and crypto primitives (`encryptionIv: undefined`) before returning payloads to clients.

*Code Reference*: [src/middleware/permissions.ts](file:///c:/Trust%20vault/backend/src/middleware/permissions.ts#L65-L75), [src/routes/documents.ts](file:///c:/Trust%20vault/backend/src/routes/documents.ts#L80-L95)

---

### Entry 4 — 2026-11-03: File Encryption & At-Rest Storage

**1. Prompt:**
> "How should documents be saved to disk securely? Write a storage service that handles file upload and retrieval."

**2. What it produced:**
The AI proposed using AES-256-CBC to encrypt files on disk, storing files under their original names (e.g. `uploads/Confidential_Salary_2026.pdf.enc`) with the IV prepended to the file.

**3. What was wrong with it:**
- **CBC Mode Lacks Integrity**: AES-CBC is vulnerable to padding oracle attacks and bit-flipping without a MAC.
- **Original Filename on Disk**: Storing files with their original names leaks sensitive metadata directly into server file listings, backups, and OS file tables.
- **Path Traversal Risk**: Passing original filenames directly to disk writes allows Directory Traversal attacks (e.g. `../../etc/passwd`).

**4. What was done instead:**
- Migrated to **AES-256-GCM** (Galois/Counter Mode), which provides authenticated encryption with associated data (AEAD) and an authentication tag verifying ciphertext integrity.
- Files are saved with cryptographically random UUIDs (`fileId = uuidv4()`), totally decoupled from original names.
- File checksums (SHA-256) are calculated on plaintext upon upload and verified prior to decryption on download.

*Code Reference*: [src/services/encryption.ts](file:///c:/Trust%20vault/backend/src/services/encryption.ts#L10-L65)

---

### Entry 5 — 2026-11-03: Soft Delete and Zombie Permission Re-attachment

**1. Prompt:**
> "Implement soft delete for documents so owners can remove documents without permanently destroying data immediately."

**2. What it produced:**
The AI set `deletedAt = new Date()` on the document record when `DELETE /api/documents/:id` was invoked, and updated the query filter to exclude documents where `deletedAt != null`.

**3. What was wrong with it:**
- **Orphaned Active Permissions**: The document permissions in `document_permissions` remained marked as active (`revokedAt = null`). If an administrator or owner restored the document in the future, all previous viewer permissions would silently reactivate, even if users had left or relationships changed in the interim.
- **Audit Void**: The AI failed to audit the cascading revocation of access for existing viewers.

**4. What was done instead:**
When a document is soft-deleted:
1. `document.deletedAt` is set to `new Date()`.
2. All active document permissions for that document are explicitly revoked in the same transaction: `prisma.documentPermission.updateMany({ where: { documentId, revokedAt: null }, data: { revokedAt: new Date() } })`.
3. An audit log event `DELETE` is generated with document title and owner context.

*Code Reference*: [src/routes/documents.ts](file:///c:/Trust%20vault/backend/src/routes/documents.ts#L225-L255)
