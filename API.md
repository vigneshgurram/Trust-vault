# TrustVault API Documentation

Base URL: `http://localhost:3001/api`

All authenticated requests must include the header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Authentication Endpoints

### 1. `POST /api/auth/login`
- **Who is allowed**: Anyone (Public / Unauthenticated)
- **Rate Limit**: 20 requests per 15 minutes
- **Request Body**:
  ```json
  {
    "email": "owner@trustvault.com",
    "password": "Owner@123456"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "email": "owner@trustvault.com",
      "name": "Document Owner",
      "role": "owner"
    }
  }
  ```
- **Audit**: Logged as `LOGIN` or `LOGIN_FAILED`.

### 2. `POST /api/auth/logout`
- **Who is allowed**: Any authenticated user (`admin`, `owner`, `viewer`)
- **Response**: `200 OK`
- **Audit**: Logged as `LOGOUT`.

### 3. `GET /api/auth/me`
- **Who is allowed**: Any active authenticated user
- **Response**: `200 OK` with user details.

---

## User Management (Admin Only)

### 4. `GET /api/users`
- **Who is allowed**: `admin` only
- **Response**: `200 OK` with array of user objects (excluding password hashes).

### 5. `POST /api/users`
- **Who is allowed**: `admin` only
- **Request Body**:
  ```json
  {
    "email": "newuser@example.com",
    "name": "Jane Doe",
    "password": "SecurePassword123",
    "role": "viewer" // admin | owner | viewer
  }
  ```
- **Response**: `201 Created`
- **Audit**: Logged as `USER_CREATED`.

### 6. `PATCH /api/users/:id`
- **Who is allowed**: `admin` only
- **Request Body**: `{ "name"?, "role"?, "isActive"?, "password"? }`
- **Response**: `200 OK`
- **Audit**: Logged as `USER_UPDATED`. Immediate lockout if `isActive: false`.

---

## Document Management

### 7. `GET /api/documents`
- **Who is allowed**: Any authenticated user (`admin`, `owner`, `viewer`)
- **Query Parameters**:
  - `search`: Case-insensitive title, description, or original filename search
  - `category`: Exact category match
  - `owner`: Filter by owner ID
  - `startDate`, `endDate`: ISO date filters
  - `page`, `limit`: Pagination parameters
- **Access Boundary**:
  - `owner` and `viewer`: Only documents they own OR documents where an active grant exists (`revokedAt = null`).
  - `admin`: Metadata of all non-deleted documents for system monitoring.
- **Response**: `200 OK` with list of documents (sanitized: no `filePath` or `encryptionIv`).

### 8. `POST /api/documents`
- **Who is allowed**: `owner` or `admin` only (viewers receive `403 Forbidden`)
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `file`: Document file (PDF, Office, CSV, TXT, images; max 50MB)
  - `title`: String (required)
  - `description`: String (optional)
  - `category`: String (optional)
- **Response**: `201 Created`
- **Storage**: Plaintext encrypted at rest with AES-256-GCM under random UUID.
- **Audit**: Logged as `UPLOAD`.

### 9. `GET /api/documents/:id`
- **Who is allowed**: Document owner OR users with active `READ` or `EDIT` permission.
- **Access Boundary**: Returns `404 Not Found` if user has no grant (prevents ID enumeration).
- **Response**: `200 OK` with document metadata.
- **Audit**: Logged as `VIEW`.

### 10. `GET /api/documents/:id/download`
- **Who is allowed**: Document owner OR users with active `READ` or `EDIT` permission.
- **Access Boundary**: Server decrypts AES-256-GCM ciphertext on-the-fly and verifies SHA-256 checksum. Returns `404 Not Found` if unpermitted.
- **Response**: `200 OK` with decrypted binary stream.
- **Audit**: Logged as `DOWNLOAD`.

### 11. `PATCH /api/documents/:id`
- **Who is allowed**: Document owner OR users with active `EDIT` permission.
- **Request Body**: `{ "title"?, "description"?, "category"? }`
- **Response**: `200 OK`
- **Audit**: Logged as `EDIT`.

### 12. `DELETE /api/documents/:id`
- **Who is allowed**: Document owner only (or `admin`).
- **Behavior**: Sets `deletedAt = NOW()` and revokes all active permissions.
- **Response**: `200 OK`
- **Audit**: Logged as `DELETE`.

---

## Document Permissions (ACL)

### 13. `GET /api/documents/:id/permissions`
- **Who is allowed**: Document owner (or `admin`).
- **Response**: `200 OK` with list of past and present grants.

### 14. `POST /api/documents/:id/permissions`
- **Who is allowed**: Document owner only.
- **Request Body**:
  ```json
  {
    "userId": "uuid-of-user",
    "permissionLevel": "READ" // "READ" or "EDIT"
  }
  ```
- **Response**: `201 Created`
- **Audit**: Logged as `PERMISSION_GRANT`.

### 15. `DELETE /api/documents/:id/permissions/:permId`
- **Who is allowed**: Document owner only.
- **Behavior**: Sets `revokedAt = NOW()`. Immediate revocation; no token expiry lag.
- **Response**: `200 OK`
- **Audit**: Logged as `PERMISSION_REVOKE`.

---

## Audit & Verification

### 16. `GET /api/audit`
- **Who is allowed**: `admin` only.
- **Query Parameters**: `action`, `userId`, `resourceType`, `resourceId`, `startDate`, `endDate`, `page`, `limit`.
- **Response**: `200 OK` with paginated audit logs.

### 17. `GET /api/audit/document/:docId`
- **Who is allowed**: Document owner (for their own document) OR `admin`.
- **Response**: `200 OK` with full audit history for the document.

### 18. `GET /api/audit/verify`
- **Who is allowed**: `admin` only.
- **Behavior**: Recomputes HMAC-SHA256 across all records from sequence 1 to present. Checks chain linkage (`previousHash == prev.entryHash`).
- **Response**: `200 OK`
  ```json
  {
    "valid": true,
    "totalEntries": 42,
    "message": "All 42 audit entries verified successfully"
  }
  ```
- **Audit**: Logged as `CHAIN_VERIFIED`.

---

## Admin Activity & Monitoring

### 19. `GET /api/admin/stats`
- **Who is allowed**: `admin` only.
- **Response**: Total users, active documents, active permissions, 24h action count.

### 20. `GET /api/admin/activity`
- **Who is allowed**: `admin` only.
- **Response**: Recent global audit events.

### 21. `GET /api/admin/permission-changes`
- **Who is allowed**: `admin` only.
- **Response**: Filtered stream of all `PERMISSION_GRANT` and `PERMISSION_REVOKE` actions.

### 22. `GET /api/admin/failed-access`
- **Who is allowed**: `admin` only.
- **Response**: Audit records of failed logins and access attempts.
