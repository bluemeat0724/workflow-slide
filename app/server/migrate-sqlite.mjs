import Database from 'better-sqlite3'
import { getServerConfig, getSqliteConfig } from './config.mjs'
import fs from 'node:fs'
import path from 'node:path'

const statements = [
  `
    create table if not exists users (
      id text primary key,
      email text not null unique,
      name text not null,
      created_at text not null default (datetime('now'))
    )
  `,
  `
    create table if not exists diagrams (
      id text primary key,
      owner_user_id text not null references users(id),
      title text not null,
      status text not null default 'draft',
      current_revision_id text,
      latest_version integer not null default 0,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      deleted_at text,
      check (status in ('draft', 'published', 'archived'))
    )
  `,
  `
    create index if not exists idx_diagrams_owner_updated
      on diagrams(owner_user_id, updated_at desc)
  `,
  `
    create table if not exists diagram_snapshots (
      diagram_id text primary key references diagrams(id) on delete cascade,
      latest_draft_json text not null,
      schema_version text not null,
      updated_by text not null references users(id),
      updated_at text not null default (datetime('now'))
    )
  `,
  `
    create table if not exists diagram_revisions (
      id text primary key,
      diagram_id text not null references diagrams(id) on delete cascade,
      version integer not null,
      content_json text not null,
      content_hash text not null,
      source text not null,
      change_summary text,
      created_by text not null references users(id),
      created_at text not null default (datetime('now')),
      check (source in ('autosave', 'manual_save', 'import', 'publish', 'restore')),
      unique (diagram_id, version)
    )
  `,
  `
    create index if not exists idx_diagram_revisions_diagram_created
      on diagram_revisions(diagram_id, created_at desc)
  `,
  `
    create table if not exists diagram_members (
      diagram_id text not null references diagrams(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      role text not null,
      created_at text not null default (datetime('now')),
      primary key (diagram_id, user_id),
      check (role in ('owner', 'editor', 'viewer'))
    )
  `,
]

export async function migrate() {
  const { defaultUserEmail, defaultUserId, defaultUserName } = getServerConfig()
  const { filePath } = getSqliteConfig()
  const dataDir = path.dirname(filePath)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  try {
    for (const statement of statements) {
      db.exec(statement)
    }

    db.prepare(`
      insert or replace into users (id, email, name)
      values (?, ?, ?)
    `).run(defaultUserId, defaultUserEmail, defaultUserName)

    console.log('SQLite database migration completed.')
    console.log(`Database file: ${filePath}`)
  } finally {
    db.close()
  }
}
