import type pg from 'pg';

export interface AssetRow {
  id: string;
  owner_id: string;
  storage_key: string;
  content_type: string;
  is_animated: boolean;
  width: number;
  height: number;
  byte_size: number;
  original_name: string | null;
  created_at: string;
}

export interface AssetsRepo {
  insert(row: Omit<AssetRow, 'created_at'>): Promise<void>;
  listByOwner(ownerId: string): Promise<AssetRow[]>;
  deleteById(id: string, ownerId: string): Promise<void>;
}

export function createAssetsRepo(pool: pg.Pool): AssetsRepo {
  return {
    async insert(row) {
      await pool.query(
        `insert into assets
           (id, owner_id, storage_key, content_type, is_animated, width, height, byte_size, original_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (id) do nothing`,
        [
          row.id,
          row.owner_id,
          row.storage_key,
          row.content_type,
          row.is_animated,
          row.width,
          row.height,
          row.byte_size,
          row.original_name,
        ],
      );
    },
    async listByOwner(ownerId) {
      const res = await pool.query<AssetRow>(
        'select * from assets where owner_id = $1 order by created_at desc',
        [ownerId],
      );
      return res.rows;
    },
    async deleteById(id, ownerId) {
      await pool.query('delete from assets where id = $1 and owner_id = $2', [id, ownerId]);
    },
  };
}
