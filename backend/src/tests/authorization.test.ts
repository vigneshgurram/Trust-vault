import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import app from '../index';
import { setupTestDb, createTestUsers, getAuthToken } from './setup';
import { saveEncryptedFile } from '../services/encryption';

const request = supertest(app);
const prisma = new PrismaClient();

describe('Authorization - Document Access Control', () => {
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  let owner1Token: string;
  let owner2Token: string;
  let viewer1Token: string;
  let viewer2Token: string;
  let adminToken: string;
  let owner1DocId: string;

  beforeEach(async () => {
    await setupTestDb();
    users = await createTestUsers();

    // Get tokens
    owner1Token = await getAuthToken(app, 'testowner1@test.com');
    owner2Token = await getAuthToken(app, 'testowner2@test.com');
    viewer1Token = await getAuthToken(app, 'testviewer1@test.com');
    viewer2Token = await getAuthToken(app, 'testviewer2@test.com');
    adminToken = await getAuthToken(app, 'testadmin@test.com');

    // Owner1 uploads a document
    const res = await request
      .post('/api/documents')
      .set('Authorization', `Bearer ${owner1Token}`)
      .attach('file', Buffer.from('SECRET CONTENT OF OWNER 1'), 'secret.txt')
      .field('title', 'Owner1 Secret Document')
      .field('category', 'confidential');

    owner1DocId = res.body.id;
  });

  describe('CRITICAL: Cross-user document access prevention', () => {
    it('owner2 CANNOT read owner1 document metadata', async () => {
      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${owner2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });

    it('owner2 CANNOT download owner1 document', async () => {
      const res = await request
        .get(`/api/documents/${owner1DocId}/download`)
        .set('Authorization', `Bearer ${owner2Token}`);

      expect(res.status).toBe(404);
    });

    it('viewer1 CANNOT read unshared document', async () => {
      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`);

      expect(res.status).toBe(404);
    });

    it('viewer1 CANNOT download unshared document', async () => {
      const res = await request
        .get(`/api/documents/${owner1DocId}/download`)
        .set('Authorization', `Bearer ${viewer1Token}`);

      expect(res.status).toBe(404);
    });

    it('viewer1 CANNOT edit unshared document', async () => {
      const res = await request
        .patch(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`)
        .send({ title: 'HACKED TITLE' });

      expect(res.status).toBe(404);
    });

    it('viewer1 CANNOT delete unshared document', async () => {
      const res = await request
        .delete(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`);

      expect(res.status).toBe(404);
    });

    it('unauthenticated user CANNOT access any document', async () => {
      const res = await request.get(`/api/documents/${owner1DocId}`);
      expect(res.status).toBe(401);
    });

    it('unauthenticated user CANNOT download any document', async () => {
      const res = await request.get(`/api/documents/${owner1DocId}/download`);
      expect(res.status).toBe(401);
    });
  });

  describe('CRITICAL: Permission grant/revoke enforcement', () => {
    it('viewer1 CAN read document AFTER being granted READ', async () => {
      // Grant READ to viewer1
      await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Owner1 Secret Document');
    });

    it('viewer1 CANNOT read document AFTER permission is revoked', async () => {
      // Grant READ
      const grantRes = await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      const permId = grantRes.body.id;

      // Verify access works
      let res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`);
      expect(res.status).toBe(200);

      // REVOKE
      await request
        .delete(`/api/documents/${owner1DocId}/permissions/${permId}`)
        .set('Authorization', `Bearer ${owner1Token}`);

      // Verify access is IMMEDIATELY denied
      res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`);
      expect(res.status).toBe(404);
    });

    it('viewer1 with READ CANNOT edit document', async () => {
      // Grant READ only
      await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      const res = await request
        .patch(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`)
        .send({ title: 'ATTEMPTED EDIT' });

      expect(res.status).toBe(404); // 404 not 403 - don't reveal existence
    });

    it('viewer1 with EDIT CAN edit document', async () => {
      // Grant EDIT
      await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'EDIT' });

      const res = await request
        .patch(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer1Token}`)
        .send({ title: 'EDITED TITLE' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('EDITED TITLE');
    });

    it('viewer2 CANNOT access document shared only with viewer1', async () => {
      // Share with viewer1 only
      await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      // viewer2 tries to access
      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer2Token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('CRITICAL: Permission management authorization', () => {
    it('viewer CANNOT grant permissions on any document', async () => {
      const res = await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${viewer1Token}`)
        .send({ userId: users.viewer2.id, permissionLevel: 'READ' });

      // Should fail - viewer is not the owner
      expect(res.status).toBe(403);
    });

    it('owner2 CANNOT grant permissions on owner1 document', async () => {
      const res = await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner2Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      expect(res.status).toBe(403);
    });

    it('owner2 CANNOT revoke permissions on owner1 document', async () => {
      // First grant a permission
      const grantRes = await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      const permId = grantRes.body.id;

      // owner2 tries to revoke
      const res = await request
        .delete(`/api/documents/${owner1DocId}/permissions/${permId}`)
        .set('Authorization', `Bearer ${owner2Token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('CRITICAL: Document listing only shows permitted documents', () => {
    it('owner2 document list does NOT include owner1 documents', async () => {
      const res = await request
        .get('/api/documents')
        .set('Authorization', `Bearer ${owner2Token}`);

      expect(res.status).toBe(200);
      const docIds = res.body.documents.map((d: any) => d.id);
      expect(docIds).not.toContain(owner1DocId);
    });

    it('viewer document list only includes shared documents', async () => {
      // Share with viewer1
      await request
        .post(`/api/documents/${owner1DocId}/permissions`)
        .set('Authorization', `Bearer ${owner1Token}`)
        .send({ userId: users.viewer1.id, permissionLevel: 'READ' });

      // viewer1 should see it
      const v1Res = await request
        .get('/api/documents')
        .set('Authorization', `Bearer ${viewer1Token}`);
      const v1Docs = v1Res.body.documents.map((d: any) => d.id);
      expect(v1Docs).toContain(owner1DocId);

      // viewer2 should NOT
      const v2Res = await request
        .get('/api/documents')
        .set('Authorization', `Bearer ${viewer2Token}`);
      const v2Docs = v2Res.body.documents.map((d: any) => d.id);
      expect(v2Docs).not.toContain(owner1DocId);
    });
  });

  describe('CRITICAL: Viewers cannot upload documents', () => {
    it('viewer CANNOT upload a document', async () => {
      const res = await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${viewer1Token}`)
        .attach('file', Buffer.from('viewer trying to upload'), 'hack.txt')
        .field('title', 'Unauthorized Upload');

      expect(res.status).toBe(403);
    });
  });

  describe('CRITICAL: ID enumeration prevention', () => {
    it('returns 404 (not 403) for unauthorized document access', async () => {
      // This is important: returning 403 would confirm the document exists
      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${viewer2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });

    it('returns 404 for non-existent document ID', async () => {
      const res = await request
        .get('/api/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${owner1Token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('CRITICAL: Deleted document access', () => {
    it('CANNOT access a soft-deleted document', async () => {
      // Delete the document
      await request
        .delete(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${owner1Token}`);

      // Try to access it
      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${owner1Token}`);

      expect(res.status).toBe(404);
    });

    it('CANNOT download a soft-deleted document', async () => {
      await request
        .delete(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${owner1Token}`);

      const res = await request
        .get(`/api/documents/${owner1DocId}/download`)
        .set('Authorization', `Bearer ${owner1Token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('CRITICAL: Sensitive data not leaked in responses', () => {
    it('document response does NOT contain file path', async () => {
      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${owner1Token}`);

      expect(res.body.filePath).toBeUndefined();
    });

    it('document response does NOT contain encryption IV', async () => {
      const res = await request
        .get(`/api/documents/${owner1DocId}`)
        .set('Authorization', `Bearer ${owner1Token}`);

      expect(res.body.encryptionIv).toBeUndefined();
    });

    it('document list does NOT contain file paths', async () => {
      const res = await request
        .get('/api/documents')
        .set('Authorization', `Bearer ${owner1Token}`);

      for (const doc of res.body.documents) {
        expect(doc.filePath).toBeUndefined();
        expect(doc.encryptionIv).toBeUndefined();
      }
    });
  });
});
