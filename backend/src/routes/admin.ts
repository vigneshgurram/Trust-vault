import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate, requireRole('admin'));

// Dashboard: overall stats
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  const [
    totalUsers,
    activeUsers,
    totalDocuments,
    totalPermissions,
    recentActivity,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.document.count({ where: { deletedAt: null } }),
    prisma.documentPermission.count({ where: { revokedAt: null } }),
    prisma.auditLog.count({
      where: {
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  res.json({
    totalUsers,
    activeUsers,
    totalDocuments,
    activePermissions: totalPermissions,
    last24hActions: recentActivity,
  });
});

// Recent activity feed
router.get('/activity', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);

  const activity = await prisma.auditLog.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  res.json(activity);
});

// Permission changes feed
router.get('/permission-changes', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);

  const changes = await prisma.auditLog.findMany({
    where: {
      action: { in: ['PERMISSION_GRANT', 'PERMISSION_REVOKE'] },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  res.json(changes);
});

// Failed access attempts
router.get('/failed-access', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);

  const attempts = await prisma.auditLog.findMany({
    where: {
      action: { in: ['LOGIN_FAILED', 'ACCESS_DENIED'] },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  res.json(attempts);
});

export default router;
