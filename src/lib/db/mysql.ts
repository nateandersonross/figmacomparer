import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_DATABASE);
}

export function getPool(): mysql.Pool {
  if (pool) return pool;
  if (!isDbConfigured()) {
    throw new Error(
      "MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE in .env."
    );
  }

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
  });

  return pool;
}

async function addColumnIfMissing(
  p: mysql.Pool,
  table: string,
  column: string,
  definition: string
) {
  const [rows] = await p.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  const exists = Number(rows[0]?.count ?? 0) > 0;
  if (!exists) {
    await p.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

export function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS flagged_issues (
        id VARCHAR(64) PRIMARY KEY,
        website_url VARCHAR(2048) NOT NULL,
        url_key VARCHAR(512) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        session_id VARCHAR(64) NULL,
        breakpoint_width INT NOT NULL,
        breakpoint_label VARCHAR(255) NOT NULL,
        element_id VARCHAR(255) NOT NULL,
        element_label VARCHAR(500) NOT NULL,
        element_kind VARCHAR(32) NOT NULL,
        category VARCHAR(32) NOT NULL,
        property VARCHAR(128) NOT NULL,
        expected VARCHAR(500) NOT NULL,
        actual VARCHAR(500) NOT NULL,
        notes TEXT NOT NULL,
        anchor_x DECIMAL(8,3) NOT NULL,
        anchor_y DECIMAL(8,3) NOT NULL,
        anchor_w DECIMAL(8,3) NOT NULL,
        anchor_h DECIMAL(8,3) NOT NULL,
        resolved TINYINT(1) NOT NULL DEFAULT 0,
        resolved_at DATETIME NULL,
        INDEX idx_url_key (url_key)
      )
    `);

    await addColumnIfMissing(p, "flagged_issues", "resolved", "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumnIfMissing(p, "flagged_issues", "resolved_at", "DATETIME NULL");
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}
