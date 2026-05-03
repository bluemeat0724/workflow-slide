import { getPool } from './db.mjs'
import { getServerConfig } from './config.mjs'

const { defaultUserEmail, defaultUserId, defaultUserName } = getServerConfig()

const statements = [
  `
    create table if not exists users (
      id uuid primary key,
      email text not null unique,
      name text not null,
      created_at timestamptz not null default now()
    )
  `,
  `
    create table if not exists diagrams (
      id uuid primary key,
      owner_user_id uuid not null references users(id),
      title text not null,
      status text not null default 'draft',
      current_revision_id uuid null,
      latest_version integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz null,
      constraint diagrams_status_check
        check (status in ('draft', 'published', 'archived'))
    )
  `,
  `
    create index if not exists idx_diagrams_owner_updated
      on diagrams(owner_user_id, updated_at desc)
  `,
  `
    create table if not exists diagram_snapshots (
      diagram_id uuid primary key references diagrams(id) on delete cascade,
      latest_draft_jsonb jsonb not null,
      schema_version text not null,
      updated_by uuid not null references users(id),
      updated_at timestamptz not null default now()
    )
  `,
  `
    create index if not exists idx_diagram_snapshots_jsonb
      on diagram_snapshots using gin (latest_draft_jsonb)
  `,
  `
    create table if not exists diagram_revisions (
      id uuid primary key,
      diagram_id uuid not null references diagrams(id) on delete cascade,
      version integer not null,
      content_jsonb jsonb not null,
      content_hash text not null,
      source text not null,
      change_summary text null,
      created_by uuid not null references users(id),
      created_at timestamptz not null default now(),
      constraint diagram_revisions_source_check
        check (source in ('autosave', 'manual_save', 'import', 'publish', 'restore')),
      constraint diagram_revisions_version_unique
        unique (diagram_id, version)
    )
  `,
  `
    create index if not exists idx_diagram_revisions_diagram_created
      on diagram_revisions(diagram_id, created_at desc)
  `,
  `
    create table if not exists diagram_members (
      diagram_id uuid not null references diagrams(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      role text not null,
      created_at timestamptz not null default now(),
      primary key (diagram_id, user_id),
      constraint diagram_members_role_check
        check (role in ('owner', 'editor', 'viewer'))
    )
  `,
]

async function migrate() {
  const pool = getPool()

  try {
    for (const statement of statements) {
      await pool.query(statement)
    }

    await pool.query(
      `
        insert into users (id, email, name)
        values ($1, $2, $3)
        on conflict (id) do update
        set email = excluded.email,
            name = excluded.name
      `,
      [defaultUserId, defaultUserEmail, defaultUserName],
    )

    console.log('Database migration completed.')
  } finally {
    await pool.end()
  }
}

migrate().catch((error) => {
  console.error('Database migration failed.')
  console.error(error)
  process.exitCode = 1
})
