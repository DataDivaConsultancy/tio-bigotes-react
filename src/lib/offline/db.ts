import Dexie, { type Table } from 'dexie'

/**
 * Cola de operaciones que se ejecutan cuando hay conexión.
 * Para cada operación pendiente almacenamos el nombre de la RPC y los params.
 */
export interface OperacionPendiente {
  id?: number
  tipo: 'rpc' | 'storage_upload'
  rpc?: string                  // nombre de la RPC si tipo='rpc'
  params?: any
  storage_bucket?: string       // si es upload
  storage_path?: string
  storage_blob_b64?: string     // base64 del archivo (queda en IndexedDB)
  storage_content_type?: string
  // metadatos
  contexto?: string             // ej "recepcion:UUID linea:UUID"
  creado_at: number
  intentos: number
  ultimo_error?: string | null
}

export interface FotoPendiente {
  id?: number
  bucket: string
  path: string                  // path final en storage
  blob: Blob
  creado_at: number
}

class OfflineDB extends Dexie {
  cola!: Table<OperacionPendiente, number>
  fotos!: Table<FotoPendiente, number>

  constructor() {
    super('tb-compras-offline')
    this.version(1).stores({
      cola: '++id, creado_at, tipo, rpc',
      fotos: '++id, creado_at, bucket',
    })
  }
}

export const offlineDb = new OfflineDB()
