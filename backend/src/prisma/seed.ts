import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@trustvault.com' },
    update: {},
    create: {
      email: 'admin@trustvault.com',
      name: 'System Administrator',
      passwordHash: adminPassword,
      role: 'admin',
      isActive: true,
    },
  });
  console.log(`Created admin: ${admin.email}`);

  // Create document owner
  const ownerPassword = await bcrypt.hash('Owner@123456', 12);
  const owner = await prisma.user.upsert({
    where: { email: 'owner@trustvault.com' },
    update: {},
    create: {
      email: 'owner@trustvault.com',
      name: 'Document Owner',
      passwordHash: ownerPassword,
      role: 'owner',
      isActive: true,
    },
  });
  console.log(`Created owner: ${owner.email}`);

  // Create second owner
  const owner2Password = await bcrypt.hash('Owner2@123456', 12);
  const owner2 = await prisma.user.upsert({
    where: { email: 'owner2@trustvault.com' },
    update: {},
    create: {
      email: 'owner2@trustvault.com',
      name: 'Second Owner',
      passwordHash: owner2Password,
      role: 'owner',
      isActive: true,
    },
  });
  console.log(`Created owner2: ${owner2.email}`);

  // Create viewer user
  const viewerPassword = await bcrypt.hash('Viewer@123456', 12);
  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@trustvault.com' },
    update: {},
    create: {
      email: 'viewer@trustvault.com',
      name: 'Document Viewer',
      passwordHash: viewerPassword,
      role: 'viewer',
      isActive: true,
    },
  });
  console.log(`Created viewer: ${viewer.email}`);

  // Create second viewer
  const viewer2Password = await bcrypt.hash('Viewer2@123456', 12);
  const viewer2 = await prisma.user.upsert({
    where: { email: 'viewer2@trustvault.com' },
    update: {},
    create: {
      email: 'viewer2@trustvault.com',
      name: 'Second Viewer',
      passwordHash: viewer2Password,
      role: 'viewer',
      isActive: true,
    },
  });
  console.log(`Created viewer2: ${viewer2.email}`);

  // Create disabled user for testing
  const disabledPassword = await bcrypt.hash('Disabled@123456', 12);
  const disabled = await prisma.user.upsert({
    where: { email: 'disabled@trustvault.com' },
    update: {},
    create: {
      email: 'disabled@trustvault.com',
      name: 'Disabled User',
      passwordHash: disabledPassword,
      role: 'viewer',
      isActive: false,
    },
  });
  console.log(`Created disabled user: ${disabled.email}`);

  console.log('\nSeed complete! Users created:');
  console.log('  admin@trustvault.com    / Admin@123456    (admin)');
  console.log('  owner@trustvault.com    / Owner@123456    (owner)');
  console.log('  owner2@trustvault.com   / Owner2@123456   (owner)');
  console.log('  viewer@trustvault.com   / Viewer@123456   (viewer)');
  console.log('  viewer2@trustvault.com  / Viewer2@123456  (viewer)');
  console.log('  disabled@trustvault.com / Disabled@123456 (viewer, inactive)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
