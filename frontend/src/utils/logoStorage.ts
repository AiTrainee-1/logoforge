/**
 * Remembers the user's uploaded logo in the browser (IndexedDB) so it is
 * restored automatically on the next visit instead of needing a re-upload
 * every time. Nothing here talks to the backend - it only keeps the raw
 * file bytes locally, per browser.
 */
const DB_NAME = 'logoforge'
const DB_VERSION = 1
const STORE = 'logo'
const KEY = 'saved'

interface StoredLogo {
  blob: Blob
  name: string
  type: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveLogoBlob(file: File): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const record: StoredLogo = { blob: file, name: file.name, type: file.type }
      tx.objectStore(STORE).put(record, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Private browsing / storage disabled - the logo just won't be remembered.
  }
}

export async function loadSavedLogo(): Promise<File | null> {
  try {
    const db = await openDb()
    const record = await new Promise<StoredLogo | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(KEY)
      request.onsuccess = () => resolve(request.result as StoredLogo | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    if (!record) return null
    return new File([record.blob], record.name, { type: record.type })
  } catch {
    return null
  }
}

export async function clearSavedLogo(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Nothing to clear, or storage disabled.
  }
}
