import { register } from 'node:module';
import env from '@next/env';
import mysql from 'mysql2/promise';

// Read-only integration check. Never prints user records, credentials, or signed URLs.
env.loadEnvConfig(process.cwd());
register('./lib/server-typescript-loader.mjs', import.meta.url);
const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, connectTimeout: 10000 });
try {
  const [authors] = await db.execute('SELECT id,slug,r2_bucket FROM packages_authors WHERE id=?', [900000001]);
  const author = authors[0];
  if (author?.slug !== 'odin' || !author.r2_bucket) throw new Error('Odin author missing');
  const [projects] = await db.execute('SELECT id,name,host,version,visible,admin_only,download_key FROM packages_projects WHERE author_id=? AND deleted_at IS NULL', [author.id]);
  const reader = await import('../lib/packages-pack-structure.ts');
  for (const p of projects) {
    if (!p.download_key) continue;
    const result = await reader.loadPackStructureFromR2({ author: { id: author.id, slug: author.slug, r2Bucket: author.r2_bucket },
      project: { id: p.id, name: p.name, version: p.version, downloadKey: p.download_key } });
    if (!result.ok || result.settings.main?.software_id !== p.host || result.version !== p.version) throw new Error('Pack structure validation failed: ' + p.id);
    console.log(JSON.stringify({ project: p.id, host: p.host, visible: Boolean(p.visible), adminOnly: Boolean(p.admin_only), structureReadable: true, categories: Object.keys(result.content).length }));
  }
  if (process.argv.includes('--bridge')) {
    const { odinManagementRequest } = await import('../lib/odin-management.ts');
    const users = await odinManagementRequest(new URLSearchParams({ page: '1' }));
    if (!Array.isArray(users.users)) throw new Error('Invalid user response');
    console.log(JSON.stringify({ bridgeWorking: true, usersTotal: users.total, firstPageCount: users.users.length }));
  }
} finally {
  await db.end();
  if (cache.has('@/lib/r2-storage')) cache.get('@/lib/r2-storage').getR2Client().destroy();
}
