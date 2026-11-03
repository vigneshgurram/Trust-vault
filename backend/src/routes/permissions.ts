import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { auditAction } from '../middleware/audit';

const router = Router();
const prisma = new PrismaClient();

const grantSchema = z.object({
  userId: z.string().uuid(),
  permissionLevel: z.enum(['READ', 'EDIT']),
});

// All permission routes require authentication
router.use(authenticate);

// List permissions for a document - owner only
router.get('/:id/permissions', async (req: Request, res: Response): Promise<void> => {
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    select: { ownerId: true, deletedAt: true },
  });

  if (!document || document.deletedAt) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // Only owner or admin can view permissions
  if (document.ownerId !== req.user!.id && req.user!.role !== 'admin') {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const permissions = await prisma.documentPermission.findMany({
    where: { documentId: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { grantedAt: 'desc' },
  });

  res.json(permissions);
});

// Grant permission - owner only
router.post('/:id/permissions', validate(grantSchema), async (req: Request, res: Response): Promise<void> => {
  const { userId, permissionLevel } = req.body;

  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    select: { id: true, ownerId: true, deletedAt: true, title: true },
  });

  if (!document || document.deletedAt) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // Only owner can grant permissions
  if (document.ownerId !== req.user!.id) {
    res.status(403).json({ error: 'Only the document owner can grant permissions' });
    return;
  }

  // Cannot grant to self
  if (userId === req.user!.id) {
    res.status(400).json({ error: 'Cannot grant permissions to yourself' });
    return;
  }

  // Verify target user exists and is active
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, isActive: true },
  });

  if (!targetUser || !targetUser.isActive) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Check if active permission already exists
  const existing = await prisma.documentPermission.findFirst({
    where: {
      documentId: req.params.id,
      userId,
      permissionLevel,
      revokedAt: null,
    },
  });

  if (existing) {
    res.status(409).json({ error: 'Permission already granted' });
    return;
  }

  const permission = await prisma.documentPermission.create({
    data: {
      documentId: req.params.id,
      userId,
      permissionLevel,
      grantedById: req.user!.id,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { id: true, name: true, email: true } },
    },
  });

  await auditAction(req, 'PERMISSION_GRANT', 'permission', permission.id, {
    documentId: req.params.id,
    documentTitle: document.title,
    grantedTo: targetUser.email,
    grantedToId: userId,
    permissionLevel,
  });

  res.status(201).json(permission);
});

// Revoke permission - owner only
router.delete('/:id/permissions/:permId', async (req: Request, res: Response): Promise<void> => {
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    select: { ownerId: true, deletedAt: true, title: true },
  });

  if (!document || document.deletedAt) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // Only owner can revoke permissions
  if (document.ownerId !== req.user!.id) {
    res.status(403).json({ error: 'Only the document owner can revoke permissions' });
    return;
  }

  const permission = await prisma.documentPermission.findFirst({
    where: {
      id: req.params.permId,
      documentId: req.params.id,
      revokedAt: null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!permission) {
    res.status(404).json({ error: 'Permission not found' });
    return;
  }

  // IMMEDIATE REVOCATION: Set revokedAt to now
  await prisma.documentPermission.update({
    where: { id: permission.id },
    data: { revokedAt: new Date() },
  });

  await auditAction(req, 'PERMISSION_REVOKE', 'permission', permission.id, {
    documentId: req.params.id,
    documentTitle: document.title,
    revokedFrom: permission.user.email,
    revokedFromId: permission.userId,
    permissionLevel: permission.permissionLevel,
  });

  res.json({ message: 'Permission revoked' });
});

export default router;
