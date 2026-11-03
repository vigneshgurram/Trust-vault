import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function setupTestDb() {
  // Clean up in correct order (respect foreign keys)
  await prisma.auditLog.deleteMany();
  await prisma.documentPermission.deleteMany();
  await prisma.document.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUsers() {
  const password = await bcrypt.hash('TestPass@123', 4);

  const admin = await prisma.user.create({
    data: {
      email: 'testadmin@test.com',
      name: 'Test Admin',
      passwordHash: password,
      role: 'admin',
      isActive: true,
    },
  });

  const owner1 = await prisma.user.create({
    data: {
      email: 'testowner1@test.com',
      name: 'Test Owner 1',
      passwordHash: password,
      role: 'owner',
      isActive: true,
    },
  });

  const owner2 = await prisma.user.create({
    data: {
      email: 'testowner2@test.com',
      name: 'Test Owner 2',
      passwordHash: password,
      role: 'owner',
      isActive: true,
    },
  });

  const viewer1 = await prisma.user.create({
    data: {
      email: 'testviewer1@test.com',
      name: 'Test Viewer 1',
      passwordHash: password,
      role: 'viewer',
      isActive: true,
    },
  });

  const viewer2 = await prisma.user.create({
    data: {
      email: 'testviewer2@test.com',
      name: 'Test Viewer 2',
      passwordHash: password,
      role: 'viewer',
      isActive: true,
    },
  });

  const disabledUser = await prisma.user.create({
    data: {
      email: 'disabled@test.com',
      name: 'Disabled User',
      passwordHash: password,
      role: 'viewer',
      isActive: false,
    },
  });

  return { admin, owner1, owner2, viewer1, viewer2, disabledUser };
}

export async function getAuthToken(app: any, email: string, password: string = 'TestPass@123'): Promise<string> {
  const supertest = (await import('supertest')).default;
  const res = await supertest(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.token;
}

// Clean up connections
afterAll(async () => {
  await prisma.$disconnect();
});
