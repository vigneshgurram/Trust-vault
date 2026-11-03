export type Role = 'admin' | 'owner' | 'viewer';
export type PermissionLevel = 'READ' | 'EDIT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface DocumentPermission {
  id: string;
  documentId: string;
  userId: string;
  permissionLevel: PermissionLevel;
  grantedById: string;
  grantedAt: string;
  revokedAt: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  grantedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface DocumentItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  permissions?: DocumentPermission[];
}

export interface AuditLog {
  id: string;
  sequenceNumber: number;
  timestamp: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  previousHash: string | null;
  entryHash: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AuditVerifyResult {
  valid: boolean;
  totalEntries: number;
  brokenAt?: number;
  message: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalDocuments: number;
  activePermissions: number;
  last24hActions: number;
}
