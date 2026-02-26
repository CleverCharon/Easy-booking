require('dotenv').config();
const mysql = require('mysql2/promise');

function getDbConfig() {
  const dbPort = Number(process.env.DB_PORT || 3306);
  const dbSslEnabled = ['1', 'true', 'yes', 'on', 'required'].includes(
    String(process.env.DB_SSL || '').toLowerCase()
  );
  const dbSslRejectUnauthorized =
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true';

  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number.isFinite(dbPort) ? dbPort : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'easy_travel_db',
  };

  if (dbSslEnabled) {
    config.ssl = { rejectUnauthorized: dbSslRejectUnauthorized };
  }

  return config;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const conn = await mysql.createConnection(getDbConfig());

  try {
    const [rows] = await conn.query(
      "SELECT id, username, phone, role_code, created_at FROM sys_users WHERE role = 'admin' ORDER BY id"
    );

    console.log(`[INFO] Found ${rows.length} admin account(s).`);
    if (rows.length > 0) {
      console.table(rows);
    }

    if (!execute) {
      console.log('[DRY RUN] No rows were deleted.');
      console.log("[HOW TO EXECUTE] node scripts/delete_admin_users.js --execute");
      return;
    }

    await conn.beginTransaction();
    const [result] = await conn.query("DELETE FROM sys_users WHERE role = 'admin'");
    await conn.commit();

    console.log(`[DONE] Deleted ${result.affectedRows || 0} admin row(s) from sys_users.`);
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {}
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
