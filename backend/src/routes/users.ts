import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { auditAction } from '../middleware/audit';

const router = Router();
const prisma = new PrismaClient();

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8),
  role: z.enum(['admin', 'owner', 'viewer']),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(['admin', 'owner', 'viewer']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// All user management requires admin role
router.use(authenticate, requireRole('admin'));

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(users);
});

router.post('/', validate(createUserSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, name, password, role } = req.body;

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, name, passwordHash, role },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  await auditAction(req, 'USER_CREATED', 'user', user.id, {
    email,
    role,
    createdBy: req.user!.id,
  });

  res.status(201).json(user);
});

router.patch('/:id', validate(updateUserSchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updates: any = {};

  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.role !== undefined) updates.role = req.body.role;
  if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
  if (req.body.password) {
    updates.passwordHash = await bcrypt.hash(req.body.password, 12);
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await auditAction(req, 'USER_UPDATED', 'user', id, {
      changes: Object.keys(updates).filter((k) => k !== 'passwordHash'),
      updatedBy: req.user!.id,
    });

    res.json(user);
  } catch (err) {
    res.status(404).json({ error: 'User not found' });
  }
});

export default router;
