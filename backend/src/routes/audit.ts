import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';
import { auditAction } from '../middleware/audit';
import { verifyAuditChain } from '../services/audit';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// Get all audit logs - admin only
router.get('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { action, userId, resourceType, resourceId, startDate, endDate, page = '1', limit = '50' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (resourceType) where.resourceType = resourceType;
  if (resourceId) where.resourceId = resourceId;
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp.gte = new Date(startDate as string);
    if (endDate) where.timestamp.lte = new Date(endDate as string);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { sequenceNumber: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({
    logs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// Get audit logs for a specific document - owner of that doc or admin
router.get('/document/:docId', async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params;

  // Check ownership
  const document = await prisma.document.findUnique({
    where: { id: docId },
    select: { ownerId: true },
  });

  if (!document) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  if (document.ownerId !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      resourceId: docId,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { sequenceNumber: 'desc' },
  });

  res.json(logs);
});

// Verify audit chain integrity - admin only
router.get('/verify', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const result = await verifyAuditChain();

  await auditAction(req, 'CHAIN_VERIFIED', 'audit', null, {
    result: result.valid ? 'VALID' : 'BROKEN',
    totalEntries: result.totalEntries,
  });

  res.json(result);
});

export default router;
