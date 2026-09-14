import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

interface POSQueueItem {
  id: string
  organizationId: string
  branchId: string | null
  payload: unknown
  status: 'queued' | 'syncing' | 'failed'
  attempts: number
  createdAt: string
  lastAttemptAt: string | null
}

interface SmartBizDB extends DBSchema {
  'pos-queue': {
    key: string
    value: POSQueueItem
    indexes: { 'by-status': string }
  }
}

let _db: IDBPDatabase<SmartBizDB> | null = null

async function getDB(): Promise<IDBPDatabase<SmartBizDB>> {
  if (_db) return _db
  _db = await openDB<SmartBizDB>('smartbiz-offline', 1, {
    upgrade(db) {
      const store = db.createObjectStore('pos-queue', { keyPath: 'id' })
      store.createIndex('by-status', 'status')
    },
  })
  return _db
}

export async function enqueueTransaction(item: Omit<POSQueueItem, 'id' | 'status' | 'attempts' | 'createdAt' | 'lastAttemptAt'>): Promise<string> {
  const db = await getDB()
  const id = crypto.randomUUID()
  await db.put('pos-queue', {
    ...item,
    id,
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
  })
  return id
}

export async function getPendingTransactions(): Promise<POSQueueItem[]> {
  const db = await getDB()
  return db.getAllFromIndex('pos-queue', 'by-status', 'queued')
}

export async function updateTransactionStatus(id: string, status: POSQueueItem['status'], increment = false): Promise<void> {
  const db = await getDB()
  const item = await db.get('pos-queue', id)
  if (!item) return
  await db.put('pos-queue', {
    ...item,
    status,
    attempts: increment ? item.attempts + 1 : item.attempts,
    lastAttemptAt: new Date().toISOString(),
  })
}

export async function removeTransaction(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('pos-queue', id)
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB()
  const pending = await db.getAllFromIndex('pos-queue', 'by-status', 'queued')
  return pending.length
}
