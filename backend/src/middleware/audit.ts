import { Request, Response, NextFunction } from 'express';
import { createAuditLog } from '../services/audit';

/**
 * Middleware to automatically audit requests.
 * Used for specific routes that need audit logging.
 */
export function auditMiddleware(action: string, resourceType: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Store the audit context on the request for use after response
    (req as any)._auditAction = action;
    (req as any)._auditResourceType = resourceType;
    next();
  };
}

/**
 * Create an audit log entry from a request context.
 */
export async function auditAction(
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  await createAuditLog({
    userId: req.user?.id || null,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  });
}
