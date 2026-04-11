// Serviço de inventário.
// Concentra persistência de imagem, criação da contagem e manutenção da base offline de produtos.
import * as FileSystem from 'expo-file-system/legacy';

import {
  fetchInventoryCatalog,
  lookupInventoryProductByBarcode,
  pingSyncApi,
} from '@/services/sync/api';
import {
  enqueueSyncItem,
  processSyncQueue,
  saveInventoryCountLocally,
} from '@/services/sync/queue';
import { readStorage, storageKeys, writeStorage } from '@/services/sync/storage';
import type {
  InventoryCountImage,
  InventoryOfflinePreference,
  InventoryProductCache,
  InventoryProductLookup,
  InventoryCountPayload,
  SyncQueueItem,
  StoredInventoryCount,
} from '@/services/sync/types';

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory}inventory-count-images`;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureImageDirectory() {
  const directoryInfo = await FileSystem.getInfoAsync(IMAGE_DIRECTORY);

  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIRECTORY, { intermediates: true });
  }
}

function getImageExtension(fileName?: string | null, mimeType?: string | null) {
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop();
  }

  if (mimeType?.includes('/')) {
    return mimeType.split('/').pop();
  }

  return 'jpg';
}

export async function persistInventoryImage(params: {
  sourceUri: string;
  fileName?: string | null;
  mimeType?: string | null;
}) {
  await ensureImageDirectory();

  const extension = getImageExtension(params.fileName, params.mimeType);
  const id = createId('inv-img');
  const destinationUri = `${IMAGE_DIRECTORY}/${id}.${extension}`;

  await FileSystem.copyAsync({
    from: params.sourceUri,
    to: destinationUri,
  });

  const image: InventoryCountImage = {
    id,
    uri: destinationUri,
    fileName: `${id}.${extension}`,
    mimeType: params.mimeType || `image/${extension}`,
  };

  return image;
}

export async function findInventoryProduct(codigoBarras: string) {
  // Primeiro tenta o catálogo local; se não achar, cai para o servidor.
  // Isso permite uso offline sem perder a busca online quando a base ainda não foi baixada.
  const sanitizedCode = codigoBarras.trim();

  if (!sanitizedCode) {
    throw new Error('Codigo de barras vazio.');
  }

  const cached = await getOfflineInventoryCatalogStatus();
  const cachedMatch = findInventoryProductInCache(cached.items, sanitizedCode);

  if (cachedMatch) {
    return cachedMatch;
  }

  return lookupInventoryProductByBarcode(sanitizedCode);
}

export async function createInventoryCount(
  payload: Omit<InventoryCountPayload, 'localId' | 'createdAt' | 'updatedAt'>,
  options?: { syncImmediately?: boolean },
) {
  // Toda contagem nasce localmente e entra na fila.
  // Mesmo online, o fluxo passa por aqui para manter o comportamento consistente.
  const timestamp = new Date().toISOString();
  const localId = createId('inventory');

  const count: StoredInventoryCount = {
    ...payload,
    localId,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: 'pending',
  };

  const queueItem: SyncQueueItem = {
    id: createId('sync'),
    entityType: 'inventory-count',
    createdAt: timestamp,
    attempts: 0,
    payload: count,
  };

  await saveInventoryCountLocally(count);
  await enqueueSyncItem(queueItem);

  if (options?.syncImmediately !== false) {
    await processSyncQueue();
  }

  return count;
}

function normalizeBarcode(value?: string | null) {
  return String(value || '').replace(/\s/g, '');
}

function trimLeftZeros(value: string) {
  return value.replace(/^0+/, '') || '0';
}

function padToEan13(value: string) {
  return value.padStart(13, '0');
}

function findInventoryProductInCache(
  items: InventoryProductLookup[],
  codigoBarras: string,
) {
  const normalizedCode = normalizeBarcode(codigoBarras);
  const normalizedWithoutZeros = trimLeftZeros(normalizedCode);
  const paddedCode = padToEan13(normalizedCode);
  const paddedWithoutZeros = padToEan13(normalizedWithoutZeros);

  return (
    items.find((item) => {
      const itemBarcode = normalizeBarcode(item.ProdutoCodigoBarras);
      const itemWithoutZeros = trimLeftZeros(itemBarcode);

      return (
        itemBarcode === normalizedCode ||
        itemBarcode === normalizedWithoutZeros ||
        itemBarcode === paddedCode ||
        itemBarcode === paddedWithoutZeros ||
        itemWithoutZeros === normalizedWithoutZeros
      );
    }) || null
  );
}

export async function saveInventoryOfflinePreference(
  preference: InventoryOfflinePreference,
) {
  await writeStorage(storageKeys.inventoryOfflinePreference, preference);
}

export async function getInventoryOfflinePreference() {
  return readStorage<InventoryOfflinePreference | null>(
    storageKeys.inventoryOfflinePreference,
    null,
  );
}

export async function getOfflineInventoryCatalogStatus() {
  return readStorage<InventoryProductCache>(storageKeys.inventoryProductCache, {
    items: [],
  });
}

export async function syncOfflineInventoryCatalog() {
  // Baixa a fotografia atual da BaseProdutos e substitui o cache local do aparelho.
  let apiAvailable = false;

  try {
    apiAvailable = await pingSyncApi();
  } catch {
    apiAvailable = false;
  }

  if (!apiAvailable) {
    return false;
  }

  const catalog = await fetchInventoryCatalog();
  await writeStorage(storageKeys.inventoryProductCache, {
    items: catalog.items,
    updatedAt: catalog.updatedAt || new Date().toISOString(),
  } satisfies InventoryProductCache);

  return true;
}
