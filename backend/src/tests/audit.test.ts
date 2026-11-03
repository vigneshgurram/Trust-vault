import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../index';
import { setupTestDb, createTestUsers, getAuthToken } from './setup';

const request = supertest(app);
const prisma = new PrismaClient();

describe('Audit Trail', () => {
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let adminToken: string;
  let owner1Token: string;
  let viewer1Token: string;

  beforeEach(async () => {
    await setupTestDb();
    users = await createTestUsers();
    adminToken = await getAuthToken(app, 'testadmin@test.com');
    owner1Token = await getAuthToken(app, 'testowner1@test.com');
    viewer1Token = await getAuthToken(app, 'testviewer1@test.com');
  });

  describe('Login auditing', () => {
    it('records successful login', async () => {
      const logsRes = await request
        .get('/api/audit?action=LOGIN')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      // Should have login records from beforeEach getAuthToken calls
      expect(logsRes.body.logs.length).toBeGreaterThan(0);
    });

    it('records failed login attempt', async () => {
      await request
        .post('/api/auth/login')
        .send({ email: 'testadmin@test.com', password: 'wrongpassword' });

      const logsRes = await request
        .get('/api/audit?action=LOGIN_FAILED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      expect(logsRes.body.logs.length).toBeGreaterThan(0);
    });
  });

  describe('Document auditing', () => {
    it('records document upload', async () => {
      await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${owner1Token}`)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .field('title', 'Audit Test Doc');

      const logsRes = await request
        .get('/api/audit?action=UPLOAD')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      const uploadLogs = logsRes.body.logs.filter(
        (l: any) => l.action === 'UPLOAD'
      );
      expect(uploadLogs.length).toBeGreaterThan(0);
    });

    it('records document download', async () => {
      // Upload a doc
      const uploadRes = await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${owner1Token}`)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .field('title', 'Download Test');

      // Download it
      await request
        .get(`/api/documents/${uploadRes.body.id}/download`)
        .set('Authorization', `Bearer ${owner1Token}`);

      const logsRes = await request
        .get('/api/audit?action=DOWNLOAD')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      expect(logsRes.body.logs.length).toBeGreaterThan(0);
    });
  });

  describe('Permission change auditing', () => {
    it('records permission grant', async () => {
      // Upload a doc
      const uploadRes = await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${owner1Token}`)
        .attach('file', Buffer.from('test'), 'test.txt')
        .field('title', 'Perm Test');

      // Grant permission
      await request
        .post(`/api/documents/${uploadRes.body.id}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      const logsRes = await request
        .get('/api/audit?action=PERMISSION_GRANT')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      expect(logsRes.body.logs.length).toBeGreaterThan(0);
      const grantLog = logsRes.body.logs[0];
      const details = JSON.parse(grantLog.details);
      expect(details.grantedToId).toBe(users.viewer1.id);
    });

    it('records permission revoke', async () => {
      // Upload and grant
      const uploadRes = await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${owner1Token}`)
        .attach('file', Buffer.from('test'), 'test.txt')
        .field('title', 'Revoke Test');

      const grantRes = await request
        .post(`/api/documents/${uploadRes.body.id}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      // Revoke
      await request
        .delete(`/api/documents/${uploadRes.body.id}/permissions/${grantRes.body.id}`)
        .set('Authorization', `Bearer ${owner1Token}`);

      const logsRes = await request
        .get('/api/audit?action=PERMISSION_REVOKE')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      expect(logsRes.body.logs.length).toBeGreaterThan(0);
    });
  });

  describe('HMAC chain integrity', () => {
    it('audit chain is valid after operations', async () => {
      // Do some operations to create audit entries
      await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${owner1Token}`)
        .attach('file', Buffer.from('test'), 'test.txt')
        .field('title', 'Chain Test');

      const res = await request
        .get('/api/audit/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.totalEntries).toBeGreaterThan(0);
    });

    it('detects chain tampering', async () => {
      // Create some audit entries
      await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${owner1Token}`)
        .attach('file', Buffer.from('test'), 'test.txt')
        .field('title', 'Tamper Test');

      // Tamper with an audit entry directly in the DB
      const entries = await prisma.auditLog.findMany({
        orderBy: { sequenceNumber: 'asc' },
        take: 1,
      });

      if (entries.length > 0) {
        await prisma.auditLog.update({
          where: { id: entries[0].id },
          data: { details: '{"tampered": true}' },
        });

        const res = await request
          .get('/api/audit/verify')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(false);
        expect(res.body.message).toContain('tampered');
      }
    });
  });

  describe('Audit access control', () => {
    it('viewer CANNOT access audit logs', async () => {
      const res = await request
        .get('/api/audit')
        .set('Authorization', `Bearer ${viewer1Token}`);

      expect(res.status).toBe(403);
    });

    it('owner CANNOT access global audit logs', async () => {
      const res = await request
        .get('/api/audit')
        .set('Authorization', `Bearer ${owner1Token}`);

      expect(res.status).toBe(403);
    });

    it('only admin can verify audit chain', async () => {
      const res = await request
        .get('/api/audit/verify')
        .set('Authorization', `Bearer ${owner1Token}`);

      expect(res.status).toBe(403);
    });
  });
});
