import { getDatabase, runMigrations } from '@pmt/db';

console.log('Seeding SQLite database at data/pmt_gateway.sqlite...');
const db = getDatabase();
runMigrations(db);
console.log('Database migrated and seeded successfully!');
process.exit(0);
