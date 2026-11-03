import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type PermissionLevel = 'READ' | 'EDIT';

/**
 * Check if user has the required permission on a document.
 * This runs a real-time DB query - no caching.
 * 
 * Permission hierarchy: EDIT implies READ.
 * Owner always has full access.
 * Admin does NOT have implicit access (must be explicitly granted).
 */
export async function checkDocumentPermission(
  userId: string,
  documentId: string,
  requiredLevel: PermissionLevel
): Promise<boolean> {
  // First check if user is the owner
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { ownerId: true, deletedAt: true },
  });

  if (!document || document.deletedAt) {
    return false;
  }

  // Owner always has full access
  if (document.ownerId === userId) {
    return true;
  }

  // Check explicit permission grant
  const permissionLevels: PermissionLevel[] =
    requiredLevel === 'READ' ? ['READ', 'EDIT'] : ['EDIT'];

  const permission = await prisma.documentPermission.findFirst({
    where: {
      documentId,
      userId,
      permissionLevel: { in: permissionLevels },
      revokedAt: null, // Only active permissions
    },
  });

  return !!permission;
}

/**
 * Middleware factory that checks document permission.
 * Expects :id param for document ID.
 */
export function requireDocumentPermission(level: PermissionLevel) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const documentId = req.params.id;
    if (!documentId) {
      res.status(400).json({ error: 'Document ID required' });
      return;
    }

    const hasPermission = await checkDocumentPermission(
      req.user.id,
      documentId,
      level
    );

    if (!hasPermission) {
      // Log the denied access attempt - but don't reveal document existence
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    next();
  };
}
