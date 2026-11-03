import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { requireDocumentPermission, checkDocumentPermission } from '../middleware/permissions';
import { validate } from '../middleware/validate';
import { auditAction } from '../middleware/audit';
import { saveEncryptedFile, readDecryptedFile, computeChecksum } from '../services/encryption';

const router = Router();
const prisma = new PrismaClient();

// Multer config - store in memory for encryption before disk write
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize },
  fileFilter: (_req, file, cb) => {
    if (config.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

const updateDocSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
});

// All document routes require authentication
router.use(authenticate);

// List documents accessible to the current user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const { search, category, owner, startDate, endDate, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: any = {
    deletedAt: null,
    AND: [] as any[],
  };

  // Non-admin users can only see their own docs or docs shared with them
  if (userRole !== 'admin') {
    where.AND.push({
      OR: [
        { ownerId: userId },
        {
          permissions: {
            some: {
              userId,
              revokedAt: null,
            },
          },
        },
      ],
    });
  }

  if (search) {
    where.AND.push({
      OR: [
        { title: { contains: search as string } },
        { description: { contains: search as string } },
        { originalFilename: { contains: search as string } },
      ],
    });
  }

  if (category) {
    where.AND.push({ category: category as string });
  }

  if (owner) {
    where.AND.push({ ownerId: owner as string });
  }

  if (startDate) {
    where.AND.push({ createdAt: { gte: new Date(startDate as string) } });
  }

  if (endDate) {
    where.AND.push({ createdAt: { lte: new Date(endDate as string) } });
  }

  // Remove empty AND array
  if (where.AND.length === 0) delete where.AND;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        permissions: {
          where: { revokedAt: null },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.document.count({ where }),
  ]);

  // Filter out permissions details for non-owners
  const sanitized = documents.map((doc) => {
    const isOwner = doc.ownerId === userId;
    const isAdmin = userRole === 'admin';
    return {
      ...doc,
      filePath: undefined, // Never expose file path
      encryptionIv: undefined, // Never expose encryption IV
      permissions: isOwner || isAdmin ? doc.permissions : undefined,
    };
  });

  res.json({
    documents: sanitized,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// Upload document - only owners and admins can upload
router.post(
  '/',
  (req: Request, res: Response, next) => {
    if (!req.user || !['owner', 'admin'].includes(req.user.role)) {
      res.status(403).json({ error: 'Only owners and admins can upload documents' });
      return;
    }
    next();
  },
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }

    const { title, description, category } = req.body;

    if (!title || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    // Generate unique filename
    const fileId = uuidv4();
    const ext = path.extname(req.file.originalname);
    const storedFilename = `${fileId}${ext ? '' : ''}`;

    // Encrypt and save file
    const { filePath, iv, checksum } = await saveEncryptedFile(
      req.file.buffer,
      storedFilename
    );

    const document = await prisma.document.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        filePath: storedFilename, // Store only filename, not full path
        originalFilename: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        checksum,
        encryptionIv: iv,
        ownerId: req.user!.id,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    await auditAction(req, 'UPLOAD', 'document', document.id, {
      title: document.title,
      filename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });

    res.status(201).json({
      ...document,
      filePath: undefined,
      encryptionIv: undefined,
    });
  }
);

// Get document metadata
router.get('/:id', requireDocumentPermission('READ'), async (req: Request, res: Response): Promise<void> => {
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      permissions: {
        where: { revokedAt: null },
        include: {
          user: { select: { id: true, name: true, email: true } },
          grantedBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!document || document.deletedAt) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  await auditAction(req, 'VIEW', 'document', document.id, {
    title: document.title,
  });

  const isOwner = document.ownerId === req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  res.json({
    ...document,
    filePath: undefined,
    encryptionIv: undefined,
    permissions: isOwner || isAdmin ? document.permissions : undefined,
  });
});

// Download document file
router.get('/:id/download', requireDocumentPermission('READ'), async (req: Request, res: Response): Promise<void> => {
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
  });

  if (!document || document.deletedAt) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const fullPath = path.join(config.uploadDir, document.filePath);
  
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }

  try {
    const decrypted = await readDecryptedFile(fullPath, document.encryptionIv);

    // Verify checksum
    const currentChecksum = computeChecksum(decrypted);
    if (currentChecksum !== document.checksum) {
      res.status(500).json({ error: 'File integrity check failed' });
      return;
    }

    await auditAction(req, 'DOWNLOAD', 'document', document.id, {
      title: document.title,
      filename: document.originalFilename,
    });

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.originalFilename)}"`
    );
    res.setHeader('Content-Length', decrypted.length);
    res.send(decrypted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to decrypt file' });
  }
});

// Update document metadata
router.patch('/:id', requireDocumentPermission('EDIT'), validate(updateDocSchema), async (req: Request, res: Response): Promise<void> => {
  const updates: any = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.category !== undefined) updates.category = req.body.category;

  const document = await prisma.document.update({
    where: { id: req.params.id },
    data: updates,
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  await auditAction(req, 'EDIT', 'document', document.id, {
    changes: Object.keys(updates),
    title: document.title,
  });

  res.json({
    ...document,
    filePath: undefined,
    encryptionIv: undefined,
  });
});

// Delete document (soft delete) - owner only
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
  });

  if (!document || document.deletedAt) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // Only owner can delete
  if (document.ownerId !== req.user!.id && req.user!.role !== 'admin') {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  await prisma.document.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  // Revoke all active permissions
  await prisma.documentPermission.updateMany({
    where: { documentId: req.params.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await auditAction(req, 'DELETE', 'document', document.id, {
    title: document.title,
  });

  res.json({ message: 'Document deleted' });
});

export default router;
