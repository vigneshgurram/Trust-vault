import path from 'path';
import { existsSync, mkdirSync } from 'fs';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-me',
  jwtExpiry: process.env.JWT_EXPIRY || '15m',
  auditHmacSecret: process.env.AUDIT_HMAC_SECRET || 'default-audit-secret-change-me',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || '../uploads'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/gif',
    'application/json',
    'application/xml',
  ],
};

// Ensure upload directory exists
if (!existsSync(config.uploadDir)) {
  mkdirSync(config.uploadDir, { recursive: true });
}
