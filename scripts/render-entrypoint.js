const { spawn } = require('child_process');
const path = require('path');

function runMigrate() {
  return new Promise((resolve, reject) => {
    const migratePath = path.join(__dirname, '../src/db/migrate.js');
    const child = spawn(process.execPath, [migratePath], { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Migration exited with code ${code}`));
    });
  });
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.log('Running database migrations...');
    await runMigrate();
  }
  require('../src/server.js');
}

main().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
