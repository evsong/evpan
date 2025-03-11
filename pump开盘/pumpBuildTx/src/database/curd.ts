// crud.ts
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

const dbPromise = open({
    filename: './database.db',
    driver: sqlite3.Database
});

// 创建用户
export async function createUser(userPkey: string, mintKey: string, amount: number) {
    const db = await dbPromise;
    const result = await db.run(`
        INSERT INTO users (userPkey, mintKey, amount) 
        VALUES (?, ?, ?)`, [userPkey, mintKey, amount]);
    return result.lastID;
}

// 根据 userPkey 和 mintKey 查找用户
export async function findUserByKeys(userPkey: string, mintKey: string) {
    const db = await dbPromise;
    const user = await db.get(`SELECT * FROM users WHERE userPkey = ? AND mintKey = ?`, [userPkey, mintKey]);
    return user;
}

// 更新用户
export async function updateUser(id: number, userPkey: string, mintKey: string, amount: number) {
    const db = await dbPromise;
    await db.run(`
        UPDATE users 
        SET userPkey = ?, mintKey = ?, amount = ?
        WHERE id = ?`, [userPkey, mintKey, amount, id]);
}

// 删除用户
export async function deleteUser(userPkey: string, mintKey: string) {
    const db = await dbPromise;
    await db.run(`DELETE FROM users WHERE userPkey = ? AND mintKey = ?`, [userPkey, mintKey]);
}