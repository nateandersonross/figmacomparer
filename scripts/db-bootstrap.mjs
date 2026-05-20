import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

async function addColumnIfMissing(table, column, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Added column ${table}.${column}`);
  }
}

await pool.query(`
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

await addColumnIfMissing("flagged_issues", "resolved", "TINYINT(1) NOT NULL DEFAULT 0");
await addColumnIfMissing("flagged_issues", "resolved_at", "DATETIME NULL");

const [tables] = await pool.query("SHOW TABLES");
const [cols] = await pool.query("DESCRIBE flagged_issues");
console.log("Database:", process.env.MYSQL_DATABASE);
console.log("Tables:", tables.map((r) => Object.values(r)[0]).join(", "));
console.log("flagged_issues columns:", cols.length);

await pool.end();
