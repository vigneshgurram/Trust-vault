import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { setupTestDb, createTestUsers, getAuthToken } from './setup';

const request = supertest(app);

describe('Authentication', () => {
  let users: Awaited<ReturnType<typeof createTestUsers>>;

  beforeEach(async () => {
    await setupTestDb();
    users = await createTestUsers();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'testadmin@test.com', password: 'TestPass@123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('testadmin@test.com');
      expect(res.body.user.role).toBe('admin');
      // Should not return password hash
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject invalid password', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'testadmin@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.token).toBeUndefined();
    });

    it('should reject non-existent user', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'TestPass@123' });

      expect(res.status).toBe(401);
    });

    it('should reject disabled user', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'disabled@test.com', password: 'TestPass@123' });

      expect(res.status).toBe(401);
    });

    it('should reject invalid email format', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'notanemail', password: 'TestPass@123' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user info with valid token', async () => {
      const token = await getAuthToken(app, 'testadmin@test.com');
      const res = await request
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('testadmin@test.com');
    });

    it('should reject request without token', async () => {
      const res = await request.get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.status).toBe(401);
    });

    it('should reject expired or tampered JWT', async () => {
      // Create a token with wrong secret
      const jwt = await import('jsonwebtoken');
      const fakeToken = jwt.default.sign(
        { userId: users.admin.id, email: 'testadmin@test.com', role: 'admin' },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      const res = await request
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).toBe(401);
    });
  });
});
