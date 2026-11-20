import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { OfflineDraftBill, SalonBootstrapData } from '../types/salon';

interface SBSalonOfflineDB extends DBSchema {
  draft_bills: {
    key: string;
    value: OfflineDraftBill;
  };
  cached_state: {
    key: string;
    value: {
      id: string;
      updated_at: string;
      data: SalonBootstrapData;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<SBSalonOfflineDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SBSalonOfflineDB>('sb_salon_manager_pwa_db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('draft_bills')) {
          db.createObjectStore('draft_bills', { keyPath: 'client_sync_id' });
        }
        if (!db.objectStoreNames.contains('cached_state')) {
          db.createObjectStore('cached_state', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveOfflineDraftBill(draft: OfflineDraftBill): Promise<void> {
  const db = await getDB();
  await db.put('draft_bills', draft);
}

export async function getAllOfflineDraftBills(): Promise<OfflineDraftBill[]> {
  const db = await getDB();
  const list = await db.getAll('draft_bills');
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function removeOfflineDraftBill(clientSyncId: string): Promise<void> {
  const db = await getDB();
  await db.delete('draft_bills', clientSyncId);
}

export async function updateOfflineDraftStatus(
  clientSyncId: string,
  status: OfflineDraftBill['sync_status'],
  errorMessage?: string
): Promise<void> {
  const db = await getDB();
  const item = await db.get('draft_bills', clientSyncId);
  if (item) {
    item.sync_status = status;
    item.error_message = errorMessage;
    await db.put('draft_bills', item);
  }
}

export async function cacheSalonStateLocally(data: SalonBootstrapData): Promise<void> {
  try {
    const db = await getDB();
    await db.put('cached_state', {
      id: 'latest_bootstrap',
      updated_at: new Date().toISOString(),
      data,
    });
  } catch {
    // Ignore IndexedDB quota errors in restricted frames
  }
}

export async function getCachedSalonState(): Promise<SalonBootstrapData | null> {
  try {
    const db = await getDB();
    const record = await db.get('cached_state', 'latest_bootstrap');
    return record ? record.data : null;
  } catch {
    return null;
  }
}
