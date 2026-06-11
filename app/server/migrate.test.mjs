import { describe, expect, it } from 'vitest'
import { getMigrationModule } from './migrate.mjs'

describe('getMigrationModule', () => {
  it('selects the SQLite migration', () => {
    expect(getMigrationModule('sqlite')).toBe('./migrate-sqlite.mjs')
  })

  it('selects the PostgreSQL migration', () => {
    expect(getMigrationModule('postgres')).toBe('./migrate-postgres.mjs')
  })
})
