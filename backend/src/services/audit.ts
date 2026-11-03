import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const prisma = new PrismaClient();

interface AuditEntry {
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function computeHmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function serializeForHash(entry: {
  timestamp: Date;
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  previousHash?: string | null;
}): string {
  return JSON.stringify({
    timestamp: entry.timestamp.toISOString(),
    userId: entry.userId || null,
    action: entry.action,
    resourceType: entry.resourceType || null,
    resourceId: entry.resourceId || null,
    details: entry.details || null,
    ipAddress: entry.ipAddress || null,
    userAgent: entry.userAgent || null,
    previousHash: entry.previousHash || null,
  });
}

export async function createAuditLog(entry: AuditEntry): Promise<void> {
  // Get the last audit log entry for chain
  const lastEntry = await prisma.auditLog.findFirst({
    orderBy: { sequenceNumber: 'desc' },
    select: { entryHash: true },
  });

  const previousHash = lastEntry?.entryHash || null;
  const timestamp = new Date();
  const detailsStr = entry.details ? JSON.stringify(entry.details) : null;

  const dataToHash = serializeForHash({
    timestamp,
    userId: entry.userId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    details: detailsStr,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    previousHash,
  });

  const entryHash = computeHmac(dataToHash, config.auditHmacSecret);

  await prisma.auditLog.create({
    data: {
      timestamp,
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType || null,
      resourceId: entry.resourceId || null,
      details: detailsStr,
      ipAddress: entry.ipAddress || null,
      userAgent: entry.userAgent || null,
      previousHash,
      entryHash,
    },
  });
}

export async function verifyAuditChain(): Promise<{
  valid: boolean;
  totalEntries: number;
  brokenAt?: number;
  message: string;
}> {
  const entries = await prisma.auditLog.findMany({
    orderBy: { sequenceNumber: 'asc' },
  });

  if (entries.length === 0) {
    return { valid: true, totalEntries: 0, message: 'No audit entries to verify' };
  }

  let previousHash: string | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check that the previousHash matches
    if (entry.previousHash !== previousHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAt: entry.sequenceNumber,
        message: `Chain broken at sequence ${entry.sequenceNumber}: previousHash mismatch`,
      };
    }

    // Recompute the hash
    const dataToHash = serializeForHash({
      timestamp: entry.timestamp,
      userId: entry.userId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      details: entry.details,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      previousHash: entry.previousHash,
    });

    const expectedHash = computeHmac(dataToHash, config.auditHmacSecret);

    if (entry.entryHash !== expectedHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAt: entry.sequenceNumber,
        message: `Chain broken at sequence ${entry.sequenceNumber}: entry hash mismatch (tampered)`,
      };
    }

    previousHash = entry.entryHash;
  }

  return {
    valid: true,
    totalEntries: entries.length,
    message: `All ${entries.length} audit entries verified successfully`,
  };
}
