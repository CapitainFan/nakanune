import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

const dbPackageDir = fileURLToPath(new URL('../../../packages/db', import.meta.url));

/** Один раз перед всеми тестами: создать тестовую базу, если её нет, и накатить миграции. */
export default async function setup(project: TestProject) {
  const databaseUrl = project.config.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('В vitest.config.ts не задан DATABASE_URL');

  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1);

  // CREATE DATABASE выполняется из служебной базы postgres
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  // migrate deploy только применяет новые миграции и ничего не удаляет
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: dbPackageDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
