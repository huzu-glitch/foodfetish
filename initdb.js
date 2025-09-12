// initdb.js
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs/promises'; // Use fs/promises for async file reading

dotenv.config();

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Keep this if connecting from local to Railway, or if Railway needs it
});

async function initializeDatabase() {
  try {
    await db.connect();
    console.log('Connected to the database for initialization.');

    const schemaSql = await fs.readFile('./schema.sql', { encoding: 'utf8' });
    await db.query(schemaSql);
    console.log('Database schema initialized successfully!');

  } catch (err) {
    console.error('Error initializing database:', err);
    // Exit with an error code
    process.exit(1);
  } finally {
    await db.end();
    console.log('Database connection closed.');
  }
}

initializeDatabase();