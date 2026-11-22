import type { SupabaseClient } from '@supabase/supabase-js'
import type { RemoteApi } from '@/features/sync/types'
import type { SyncRecord, SyncTable } from '@/types/models'
import { fromRemote, REMOTE_TABLE, toRemote } from './mappers'

const UNIQUE_VIOLATION = '23505'
const SERIALIZATION_FAILURE = '40001'

export function createSupabaseRemote(client: SupabaseClient): RemoteApi {
  async function fetchById(table: SyncTable, id: string): Promise<SyncRecord | null> {
    const { data, error } = await client.from(REMOTE_TABLE[table]).select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    return fromRemote(table, data)
  }

  return {
    async push(table, record, baseVersion) {
      const remoteTable = REMOTE_TABLE[table]
      try {
        if (baseVersion === null) {
          const { data, error } = await client
            .from(remoteTable)
            .insert(toRemote(table, record, 1))
            .select('*')
            .single()
          if (error?.code === UNIQUE_VIOLATION) return { status: 'conflict', server: await fetchById(table, record.id) }
          if (error) return { status: 'error', message: error.code ?? 'insert failed' }
          return { status: 'ok', record: fromRemote(table, data) }
        }

        const { data, error } = await client
          .from(remoteTable)
          .update(toRemote(table, record, baseVersion + 1))
          .eq('id', record.id)
          .eq('version', baseVersion)
          .select('*')
        if (error?.code === SERIALIZATION_FAILURE) return { status: 'conflict', server: await fetchById(table, record.id) }
        if (error) return { status: 'error', message: error.code ?? 'update failed' }
        if (!data || data.length === 0) return { status: 'conflict', server: await fetchById(table, record.id) }
        return { status: 'ok', record: fromRemote(table, data[0]) }
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : 'network' }
      }
    },

    async pull(table, since, offset, limit) {
      let query = client
        .from(REMOTE_TABLE[table])
        .select('*')
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1)
      if (since) query = query.gte('server_updated_at', since)
      const { data, error } = await query
      if (error) throw new Error(`pull ${table} failed: ${error.code ?? error.message}`)
      return (data ?? []).map((row) => fromRemote(table, row))
    },
  }
}
