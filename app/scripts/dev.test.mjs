import { describe, expect, it } from 'vitest'
import { createDevProcessSpecs } from './dev.mjs'

describe('createDevProcessSpecs', () => {
  it('forces the frontend into local-db mode while keeping the server on the root environment', () => {
    const specs = createDevProcessSpecs()

    expect(specs).toHaveLength(2)
    expect(specs.every((spec) => spec.args[0] === '--env-file')).toBe(true)
    expect(specs[0].env).toBeUndefined()
    expect(specs[0].args.at(-1)).toBe('server/index.mjs')
    expect(specs[1].args.at(-1)).toBe('node_modules/vite/bin/vite.js')
    expect(specs[1].env?.VITE_STORAGE_MODE).toBe('local-db')
    expect(specs[1].env?.VITE_API_BASE_URL).toBe('/api')
  })
})
