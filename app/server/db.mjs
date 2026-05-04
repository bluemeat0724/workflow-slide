import Database from 'better-sqlite3'
import { Pool } from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { getDatabaseUrl, getSqliteConfig } from './config.mjs'

let pgPool
let sqliteDb

export function getPool() {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: getDatabaseUrl(),
    })
  }

  return pgPool
}

export async function withTransaction(callback) {
  const client = await getPool().connect()

  try {
    await client.query('begin')
    const result = await callback(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export function getSqliteDb() {
  if (!sqliteDb) {
    const { filePath } = getSqliteConfig()
    const dataDir = path.dirname(filePath)

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    sqliteDb = new Database(filePath)
    sqliteDb.pragma('journal_mode = WAL')
    sqliteDb.pragma('foreign_keys = ON')
  }

  return sqliteDb
}
