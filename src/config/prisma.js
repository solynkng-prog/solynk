const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

if (!process.env.MYSQL_DATABASE_URL && process.env.NODE_ENV !== 'test') {
  console.warn(
    'Prisma/MySQL example is not configured. Add MYSQL_DATABASE_URL to .env to use /api/v1/posts.'
  );
}

const prisma = new PrismaClient();

module.exports = { prisma };
