import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AssetsRepo } from '../db/assetsRepo.js'
import type { ObjectStore } from '../storage/objectStore.js'

/**
 * Allowed upload types and their storage-key extensions. The schema only
 * accepts these keys: any other contentType (text/html, image/svg+xml, …)
 * would be presigned verbatim and later served from the public bucket origin
 * as active content — a stored-XSS vector.
 */
const EXT = {
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/png': 'png',
  'image/jpeg': 'jpg',
} as const

const createBody = z.object({
  id: z.string().uuid(),
  contentType: z.enum(Object.keys(EXT) as [keyof typeof EXT, ...(keyof typeof EXT)[]]),
  isAnimated: z.boolean(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().positive(),
  originalName: z.string().nullable().optional(),
})

const OWNER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function ownerOf(req: { headers: Record<string, unknown> }): string | null {
  const v = req.headers['x-owner-id']
  return typeof v === 'string' && OWNER_ID_RE.test(v) ? v : null
}

export function registerAssetRoutes(
  app: FastifyInstance,
  deps: { repo: AssetsRepo; store: ObjectStore },
): void {
  const { repo, store } = deps

  app.post('/api/assets', async (req, reply) => {
    const owner = ownerOf(req)
    if (!owner) return reply.code(400).send({ error: 'missing x-owner-id' })
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const b = parsed.data
    const key = `${owner}/${b.id}.${EXT[b.contentType]}`

    await repo.insert({
      id: b.id, owner_id: owner, storage_key: key, content_type: b.contentType,
      is_animated: b.isAnimated, width: b.width, height: b.height,
      byte_size: b.byteSize, original_name: b.originalName ?? null,
    })
    const uploadUrl = await store.presignPut(key, b.contentType)
    return reply.code(201).send({
      uploadUrl,
      asset: { id: b.id, url: store.publicUrl(key), contentType: b.contentType,
               isAnimated: b.isAnimated, width: b.width, height: b.height,
               originalName: b.originalName ?? null },
    })
  })

  app.get('/api/assets', async (req, reply) => {
    const owner = ownerOf(req)
    if (!owner) return reply.code(400).send({ error: 'missing x-owner-id' })
    const rows = await repo.listByOwner(owner)
    return reply.send({
      assets: rows.map((r) => ({
        id: r.id, url: store.publicUrl(r.storage_key), contentType: r.content_type,
        isAnimated: r.is_animated, width: r.width, height: r.height, originalName: r.original_name,
      })),
    })
  })

  app.delete('/api/assets/:id', async (req, reply) => {
    const owner = ownerOf(req)
    if (!owner) return reply.code(400).send({ error: 'missing x-owner-id' })
    const id = (req.params as { id: string }).id
    await repo.deleteById(id, owner)
    return reply.code(204).send()
  })
}
