const pool = require('./pool');

async function main() {
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`
  );
  console.log('Tables:', tables.rows.map((r) => r.table_name));

  try {
    const migrations = await pool.query('SELECT * FROM schema_migrations');
    console.log('Migrations:', migrations.rows);
  } catch (e) {
    console.log('schema_migrations:', e.message);
  }

  try {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='users'`
    );
    console.log('users columns:', cols.rows.map((r) => r.column_name));
  } catch (e) {
    console.log('users check:', e.message);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
