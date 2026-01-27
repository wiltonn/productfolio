import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminEmail = 'admin@example.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log('Admin user already exists, skipping...');
  } else {
    const passwordHash = await hashPassword('AdminPassword123');
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Admin User',
        role: UserRole.ADMIN,
        passwordHash,
      },
    });
    console.log(`Created admin user: ${admin.email}`);
  }

  // Create a sample product owner
  const poEmail = 'product.owner@example.com';
  const existingPO = await prisma.user.findUnique({
    where: { email: poEmail },
  });

  if (existingPO) {
    console.log('Product owner user already exists, skipping...');
  } else {
    const passwordHash = await hashPassword('ProductOwner123');
    const productOwner = await prisma.user.create({
      data: {
        email: poEmail,
        name: 'Product Owner',
        role: UserRole.PRODUCT_OWNER,
        passwordHash,
      },
    });
    console.log(`Created product owner: ${productOwner.email}`);
  }

  // Create a sample business owner
  const boEmail = 'business.owner@example.com';
  const existingBO = await prisma.user.findUnique({
    where: { email: boEmail },
  });

  if (existingBO) {
    console.log('Business owner user already exists, skipping...');
  } else {
    const passwordHash = await hashPassword('BusinessOwner123');
    const businessOwner = await prisma.user.create({
      data: {
        email: boEmail,
        name: 'Business Owner',
        role: UserRole.BUSINESS_OWNER,
        passwordHash,
      },
    });
    console.log(`Created business owner: ${businessOwner.email}`);
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
