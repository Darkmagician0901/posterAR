import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app'
import type { AssetRow, AssetsRepo } from '../db/assetsRepo'
import type { ObjectStore } from '../storage/objectStore'

function fakeRepo(): AssetsRepo & { rows: AssetRow[] } {
  const rows: AssetRow[] = []
  return {
    rows,
    async insert(row) {
      // mimic "on conflict (id) do nothing" — skip duplicate ids
      if (!rows.find((r) => r.id === row.id)) {
        rows.push({ ...row, created_at: new Date().toISOString() })
      }
    },
    async listByOwner(owner) { return rows.filter((r) => r.owner_id === owner) },
    async deleteById(id, owner) {
      const i = rows.findIndex((r) => r.id === id && r.owner_id === owner)
      if (i >= 0) rows.splice(i, 1)
    },
  }
}

const store: ObjectStore = {
  async presignPut(key) { return `https://store.example/${key}?X-Amz-Signature=abc` },
  publicUrl(key) { return `https://public.example/${key}` },
}

const validBody = {
  id: '11111111-1111-1111-1111-111111111111',
  contentType: 'image/webp',
  isAnimated: false,
  width: 100, height: 200, byteSize: 1234, originalName: 'a.webp',
}

describe('assets routes', () => {
  let app: ReturnType<typeof buildApp>
  let repo: ReturnType<typeof fakeRepo>
  beforeEach(() => { repo = fakeRepo(); app = buildApp({ repo, store }) })

  it('POST /api/assets presigns and stores metadata', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/assets',
      headers: { 'x-owner-id': 'owner-1' }, payload: validBody,
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.uploadUrl).toContain('X-Amz-Signature')
    expect(body.asset.url).toBe('https://public.example/owner-1/11111111-1111-1111-1111-111111111111.webp')
    expect(repo.rows).toHaveLength(1)
  })

  it('POST is idempotent on repeated id', async () => {
    const headers = { 'x-owner-id': 'owner-1' }
    await app.inject({ method: 'POST', url: '/api/assets', headers, payload: validBody })
    await app.inject({ method: 'POST', url: '/api/assets', headers, payload: validBody })
    expect(repo.rows).toHaveLength(1)
  })

  it('POST rejects a missing owner header', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/assets', payload: validBody })
    expect(res.statusCode).toBe(400)
  })

  it('GET /api/assets lists only the caller owner rows', async () => {
    await app.inject({ method: 'POST', url: '/api/assets', headers: { 'x-owner-id': 'owner-1' }, payload: validBody })
    const res = await app.inject({ method: 'GET', url: '/api/assets', headers: { 'x-owner-id': 'owner-2' } })
    expect(res.json().assets).toHaveLength(0)
  })

  it('DELETE removes the asset', async () => {
    const headers = { 'x-owner-id': 'owner-1' }
    await app.inject({ method: 'POST', url: '/api/assets', headers, payload: validBody })
    const res = await app.inject({ method: 'DELETE', url: `/api/assets/${validBody.id}`, headers })
    expect(res.statusCode).toBe(204)
    expect(repo.rows).toHaveLength(0)
  })
})
