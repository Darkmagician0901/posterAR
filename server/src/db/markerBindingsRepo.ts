import type pg from 'pg';

/** One row of `marker_bindings` — an asset anchored to an image marker. */
export interface MarkerBindingRow {
  id: string;
  owner_id: string;
  marker_name: string;
  asset_url: string;
  asset_name: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  quat_x: number;
  quat_y: number;
  quat_z: number;
  quat_w: number;
  scale: number;
  created_at: string;
  updated_at: string;
}

/** Fields callers supply; timestamps are managed by the database. */
export type MarkerBindingInput = Omit<MarkerBindingRow, 'created_at' | 'updated_at'>;

export interface MarkerBindingsRepo {
  /**
   * Inserts a binding, or overwrites it when the id already exists.
   *
   * Upsert rather than insert-or-update because the client saves the same
   * binding repeatedly as the distance slider moves, and should not have to
   * track whether the row exists yet.
   *
   * @returns False when the id already exists under a DIFFERENT owner — the
   *   write is refused rather than silently overwriting someone else's row,
   *   and the route turns that into a 409.
   */
  upsert(row: MarkerBindingInput): Promise<boolean>;
  /** Every binding belonging to one device, oldest first. */
  listByOwner(ownerId: string): Promise<MarkerBindingRow[]>;
  /** Deletes one binding, scoped to its owner so ids can't be guessed. */
  deleteById(id: string, ownerId: string): Promise<void>;
}

export function createMarkerBindingsRepo(pool: pg.Pool): MarkerBindingsRepo {
  return {
    async upsert(row) {
      const res = await pool.query(
        `insert into marker_bindings
           (id, owner_id, marker_name, asset_url, asset_name,
            pos_x, pos_y, pos_z, quat_x, quat_y, quat_z, quat_w, scale)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (id) do update set
           marker_name = excluded.marker_name,
           asset_url   = excluded.asset_url,
           asset_name  = excluded.asset_name,
           pos_x       = excluded.pos_x,
           pos_y       = excluded.pos_y,
           pos_z       = excluded.pos_z,
           quat_x      = excluded.quat_x,
           quat_y      = excluded.quat_y,
           quat_z      = excluded.quat_z,
           quat_w      = excluded.quat_w,
           scale       = excluded.scale,
           updated_at  = now()
         -- Scope the update to the owner as well as the id: without this, a
         -- caller who guessed another device's binding id could overwrite it.
         where marker_bindings.owner_id = excluded.owner_id`,
        [
          row.id,
          row.owner_id,
          row.marker_name,
          row.asset_url,
          row.asset_name,
          row.pos_x,
          row.pos_y,
          row.pos_z,
          row.quat_x,
          row.quat_y,
          row.quat_z,
          row.quat_w,
          row.scale,
        ],
      );
      // 0 rows means the `where` above blocked a cross-owner overwrite.
      return (res.rowCount ?? 0) > 0;
    },

    async listByOwner(ownerId) {
      const res = await pool.query<MarkerBindingRow>(
        `select * from marker_bindings
          where owner_id = $1
          order by marker_name asc, created_at asc`,
        [ownerId],
      );
      return res.rows;
    },

    async deleteById(id, ownerId) {
      await pool.query('delete from marker_bindings where id = $1 and owner_id = $2', [
        id,
        ownerId,
      ]);
    },
  };
}
