import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { AssetsRepo } from '../db/assetsRepo';
import type { MarkerBindingRow, MarkerBindingsRepo } from '../db/markerBindingsRepo';
import type { ObjectStore } from '../storage/objectStore';

/** In-memory stand-in for the bindings table, mirroring the SQL semantics. */
function fakeBindingsRepo(): MarkerBindingsRepo & { rows: MarkerBindingRow[] } {
  const rows: MarkerBindingRow[] = [];
  return {
    rows,
    async upsert(row) {
      const existing = rows.find((r) => r.id === row.id);
      if (existing) {
        // Matches the `where owner_id = excluded.owner_id` guard in SQL.
        if (existing.owner_id !== row.owner_id) return false;
        Object.assign(existing, row, { updated_at: new Date().toISOString() });
        return true;
      }
      const now = new Date().toISOString();
      rows.push({ ...row, created_at: now, updated_at: now });
      return true;
    },
    async listByOwner(owner) {
      return rows.filter((r) => r.owner_id === owner);
    },
    async deleteById(id, owner) {
      const i = rows.findIndex((r) => r.id === id && r.owner_id === owner);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

/** The asset dependencies buildApp requires but these tests never exercise. */
const assetsRepo: AssetsRepo = {
  async insert() {},
  async listByOwner() {
    return [];
  },
  async deleteById() {},
};

const store: ObjectStore = {
  async presignPut(key) {
    return `https://store.example/${key}`;
  },
  publicUrl(key) {
    return `https://public.example/${key}`;
  },
};

const ID = '22222222-2222-2222-2222-222222222222';
const MARKER = 'test-marker';
const headers = { 'x-owner-id': 'owner-1' };

const validBody = {
  assetUrl: '/posters/default-poster.png',
  assetName: 'Asset',
  local: { position: [0, 0, 0.25], quaternion: [0, 0, 0, 1], scale: 1 },
};

const url = (id = ID, marker = MARKER) =>
  `/api/spaces/${encodeURIComponent(marker)}/bindings/${id}`;

describe('spaces routes', () => {
  let app: ReturnType<typeof buildApp>;
  let bindings: ReturnType<typeof fakeBindingsRepo>;

  beforeEach(() => {
    bindings = fakeBindingsRepo();
    app = buildApp({ repo: assetsRepo, store, bindings });
  });

  it('PUT stores a marker-relative transform', async () => {
    const res = await app.inject({ method: 'PUT', url: url(), headers, payload: validBody });
    expect(res.statusCode).toBe(204);
    expect(bindings.rows).toHaveLength(1);
    expect(bindings.rows[0].pos_z).toBe(0.25);
    expect(bindings.rows[0].marker_name).toBe(MARKER);
  });

  it('PUT upserts, so repeated slider saves update one row', async () => {
    await app.inject({ method: 'PUT', url: url(), headers, payload: validBody });
    await app.inject({
      method: 'PUT',
      url: url(),
      headers,
      payload: { ...validBody, local: { ...validBody.local, position: [0, 0, 1.2] } },
    });
    expect(bindings.rows).toHaveLength(1);
    expect(bindings.rows[0].pos_z).toBe(1.2);
  });

  it('GET returns bindings in the nested wire shape', async () => {
    await app.inject({ method: 'PUT', url: url(), headers, payload: validBody });
    const res = await app.inject({ method: 'GET', url: '/api/spaces', headers });
    expect(res.statusCode).toBe(200);
    const { bindings: wire } = res.json();
    expect(wire).toHaveLength(1);
    expect(wire[0]).toMatchObject({
      id: ID,
      markerName: MARKER,
      local: { position: [0, 0, 0.25], quaternion: [0, 0, 0, 1], scale: 1 },
    });
  });

  it('GET only returns the caller own bindings', async () => {
    await app.inject({ method: 'PUT', url: url(), headers, payload: validBody });
    const res = await app.inject({
      method: 'GET',
      url: '/api/spaces',
      headers: { 'x-owner-id': 'owner-2' },
    });
    expect(res.json().bindings).toHaveLength(0);
  });

  it('refuses to overwrite a binding id owned by someone else', async () => {
    await app.inject({ method: 'PUT', url: url(), headers, payload: validBody });
    const res = await app.inject({
      method: 'PUT',
      url: url(),
      headers: { 'x-owner-id': 'attacker' },
      payload: { ...validBody, assetUrl: '/evil.png' },
    });
    expect(res.statusCode).toBe(409);
    expect(bindings.rows[0].asset_url).toBe('/posters/default-poster.png');
  });

  it('DELETE removes a binding', async () => {
    await app.inject({ method: 'PUT', url: url(), headers, payload: validBody });
    const res = await app.inject({ method: 'DELETE', url: url(), headers });
    expect(res.statusCode).toBe(204);
    expect(bindings.rows).toHaveLength(0);
  });

  it('rejects a missing owner header', async () => {
    const res = await app.inject({ method: 'PUT', url: url(), payload: validBody });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-uuid binding id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: url('not-a-uuid'),
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(400);
    expect(bindings.rows).toHaveLength(0);
  });

  it('rejects a marker name with path characters', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/spaces/${encodeURIComponent('../evil')}/bindings/${ID}`,
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(400);
    expect(bindings.rows).toHaveLength(0);
  });

  it('rejects a data: asset URL so image bytes cannot land in the database', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: url(),
      headers,
      payload: { ...validBody, assetUrl: 'data:image/png;base64,AAAA' },
    });
    expect(res.statusCode).toBe(400);
    expect(bindings.rows).toHaveLength(0);
  });

  it('rejects a javascript: asset URL', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: url(),
      headers,
      payload: { ...validBody, assetUrl: 'javascript:alert(1)' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a protocol-relative asset URL', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: url(),
      headers,
      payload: { ...validBody, assetUrl: '//evil.example/x.png' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-finite transform value', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: url(),
      headers,
      payload: { ...validBody, local: { ...validBody.local, scale: Number.NaN } },
    });
    expect(res.statusCode).toBe(400);
    expect(bindings.rows).toHaveLength(0);
  });

  it('rejects a zero scale that would collapse the asset', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: url(),
      headers,
      payload: { ...validBody, local: { ...validBody.local, scale: 0 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a malformed quaternion', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: url(),
      headers,
      payload: { ...validBody, local: { ...validBody.local, quaternion: [0, 0, 1] } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('does not register the routes when no bindings repo is supplied', async () => {
    const bare = buildApp({ repo: assetsRepo, store });
    const res = await bare.inject({ method: 'GET', url: '/api/spaces', headers });
    expect(res.statusCode).toBe(404);
  });
});
