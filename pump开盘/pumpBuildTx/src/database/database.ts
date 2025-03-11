// database.ts
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const dbPromise = open({
    filename: './database.db',
    driver: sqlite3.Database
});

export async function createTable() {
    const db = await dbPromise;
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userPkey TEXT NOT NULL,
            mintKey TEXT NOT NULL,
            amount INTEGER NOT NULL,
            createTime TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

createTable().catch(console.error);