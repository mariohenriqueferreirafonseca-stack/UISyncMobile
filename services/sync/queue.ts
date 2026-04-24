// Fila offline compartilhada entre formulários.
// Hoje ela conhece dois tipos de entidade: conferência de rádios e contagem de inventário.
import NetInfo from '@react-native-community/netinfo';

import {
  storageKeys,
  readStorage,
  writeStorage,
} from '@/services/sync/storage';
import {
  deleteStockMeasurement,
  pingSyncApi,
  uploadInventoryCount,
  uploadRadioConference,
  uploadStockMeasurement,
} from '@/services/sync/api';
import type {
  InventoryCountPayload,
  RadioConferencePayload,
  StockMeasurementDeletePayload,
  StockMeasurementPayload,
  StoredStockMeasurement,
  StoredInventoryCount,
  StoredRadioConference,
  SyncQueueItem,
} from '@/services/sync/types';

let syncInFlight = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isValidRadioConferencePayload(payload: RadioConferencePayload) {
  const requiredFields = [
    'localId',
    'numeroSelo',
    'usuarioNome',
    'equipamentoOperante',
    'botaoFunciona',
    'bateriaEncaixa',
    'existemRachaduras',
    'riscosProfundos',
    'capaProtetora',
    'alcaTransporte',
    'identificacaoIntegra',
    'equipamentoLimpo',
    'situacaoGeral',
    'createdAt',
    'updatedAt',
  ] as const;

  return requiredFields.every((field) => {
    const value = payload[field];
    return typeof value === 'string' && value.trim().length > 0;
  }) && Array.isArray(payload.images);
}

function isRadioConferencePayload(
  payload: SyncQueueItem['payload'],
): payload is RadioConferencePayload {
  return 'numeroSelo' in payload && 'images' in payload;
}

function isStockMeasurementDeletePayload(
  payload: SyncQueueItem['payload'],
): payload is StockMeasurementDeletePayload {
  return 'id_medicao' in payload && !('rows' in payload);
}

async function readQueue() {
  return readStorage<SyncQueueItem[]>(storageKeys.syncQueue, []);
}

async function writeQueue(queue: SyncQueueItem[]) {
  await writeStorage(storageKeys.syncQueue, queue);
}

async function readRadioConferences() {
  return readStorage<StoredRadioConference[]>(storageKeys.radioConferences, []);
}

async function writeRadioConferences(conferences: StoredRadioConference[]) {
  await writeStorage(storageKeys.radioConferences, conferences);
}

async function readInventoryCounts() {
  return readStorage<StoredInventoryCount[]>(storageKeys.inventoryCounts, []);
}

async function writeInventoryCounts(counts: StoredInventoryCount[]) {
  await writeStorage(storageKeys.inventoryCounts, counts);
}

async function readStockMeasurements() {
  return readStorage<StoredStockMeasurement[]>(storageKeys.stockMeasurements, []);
}

async function writeStockMeasurements(measurements: StoredStockMeasurement[]) {
  await writeStorage(storageKeys.stockMeasurements, measurements);
}

async function updateRadioConference(
  localId: string,
  updater: (conference: StoredRadioConference) => StoredRadioConference,
) {
  const conferences = await readRadioConferences();
  const updatedConferences = conferences.map((conference) =>
    conference.localId === localId ? updater(conference) : conference,
  );

  await writeRadioConferences(updatedConferences);
}

async function updateInventoryCount(
  localId: string,
  updater: (count: StoredInventoryCount) => StoredInventoryCount,
) {
  const counts = await readInventoryCounts();
  const updatedCounts = counts.map((count) =>
    count.localId === localId ? updater(count) : count,
  );

  await writeInventoryCounts(updatedCounts);
}

async function updateStockMeasurement(
  localId: string,
  updater: (measurement: StoredStockMeasurement) => StoredStockMeasurement,
) {
  const measurements = await readStockMeasurements();
  const updatedMeasurements = measurements.map((measurement) =>
    measurement.localId === localId ? updater(measurement) : measurement,
  );

  await writeStockMeasurements(updatedMeasurements);
}

async function isOnline() {
  const state = await NetInfo.fetch();

  if (!state.isConnected) {
    return false;
  }

  try {
    return await pingSyncApi();
  } catch {
    return false;
  }
}

function scheduleRetry() {
  // Evita empilhar vários timers quando a API está indisponível.
  if (retryTimer) {
    return;
  }

  retryTimer = setTimeout(() => {
    retryTimer = null;
    void processSyncQueue();
  }, 15000);
}

async function uploadQueueItem(item: SyncQueueItem) {
  switch (item.entityType) {
    case 'radio-conference':
      // Rádios ainda têm uma validação extra porque esse payload evoluiu algumas vezes
      // e pode existir item legado no storage.
      if (!isRadioConferencePayload(item.payload) || !isValidRadioConferencePayload(item.payload)) {
        throw new Error(
          'Payload legado ou incompleto na fila de sincronizacao. Regrave a conferencia para sincronizar no formato novo.',
        );
      }

      await uploadRadioConference(item.payload);
      await updateRadioConference(item.payload.localId, (conference) => ({
        ...conference,
        syncStatus: 'synced',
        syncedAt: new Date().toISOString(),
        lastError: undefined,
      }));
      break;
    case 'inventory-count':
      await uploadInventoryCount(item.payload as InventoryCountPayload);
      await updateInventoryCount(item.payload.localId, (count) => ({
        ...count,
        syncStatus: 'synced',
        syncedAt: new Date().toISOString(),
        lastError: undefined,
      }));
      break;
    case 'stock-measurement':
      await uploadStockMeasurement(item.payload as StockMeasurementPayload);
      await updateStockMeasurement(item.payload.localId, (measurement) => ({
        ...measurement,
        syncStatus: 'synced',
        syncedAt: new Date().toISOString(),
        lastError: undefined,
      }));
      break;
    case 'stock-measurement-delete':
      if (!isStockMeasurementDeletePayload(item.payload)) {
        throw new Error('Payload invalido para exclusao de medicao de estoque.');
      }

      await deleteStockMeasurement(item.payload.id_medicao);
      break;
    default:
      throw new Error('Tipo de sincronizacao nao suportado.');
  }
}

export async function enqueueSyncItem(item: SyncQueueItem) {
  const queue = await readQueue();
  await writeQueue([...queue, item]);
}

export async function upsertSyncItem(item: SyncQueueItem) {
  const queue = await readQueue();
  const existingIndex = queue.findIndex(
    (queueItem) =>
      queueItem.entityType === item.entityType &&
      queueItem.payload.localId === item.payload.localId,
  );

  if (existingIndex === -1) {
    await writeQueue([...queue, item]);
    return;
  }

  const updatedQueue = [...queue];
  updatedQueue[existingIndex] = {
    ...updatedQueue[existingIndex],
    payload: item.payload,
    lastError: item.lastError,
  };
  await writeQueue(updatedQueue);
}

export async function saveRadioConferenceLocally(conference: StoredRadioConference) {
  const conferences = await readRadioConferences();
  const existingIndex = conferences.findIndex(
    (item) => item.localId === conference.localId,
  );

  if (existingIndex === -1) {
    await writeRadioConferences([conference, ...conferences]);
    return;
  }

  const updatedConferences = [...conferences];
  updatedConferences[existingIndex] = conference;
  await writeRadioConferences(updatedConferences);
}

export async function clearRadioConferenceLocalHistory() {
  await writeRadioConferences([]);
}

export async function saveInventoryCountLocally(count: StoredInventoryCount) {
  const counts = await readInventoryCounts();
  await writeInventoryCounts([count, ...counts]);
}

export async function saveStockMeasurementLocally(measurement: StoredStockMeasurement) {
  const measurements = await readStockMeasurements();
  const existingIndex = measurements.findIndex(
    (item) => item.localId === measurement.localId,
  );

  if (existingIndex === -1) {
    await writeStockMeasurements([measurement, ...measurements]);
    return;
  }

  const updatedMeasurements = [...measurements];
  updatedMeasurements[existingIndex] = measurement;
  await writeStockMeasurements(updatedMeasurements);
}

export async function cancelStockMeasurementLocally(params: {
  localId: string;
  idMedicao: string;
}) {
  const measurements = await readStockMeasurements();
  await writeStockMeasurements(
    measurements.filter((measurement) => measurement.localId !== params.localId),
  );

  const queue = await readQueue();
  const filteredQueue = queue.filter((item) => {
    if (
      item.entityType === 'stock-measurement' &&
      item.payload.localId === params.localId
    ) {
      return false;
    }

    if (
      item.entityType === 'stock-measurement-delete' &&
      isStockMeasurementDeletePayload(item.payload) &&
      item.payload.localId === params.localId
    ) {
      return false;
    }

    return true;
  });

  const timestamp = new Date().toISOString();
  const deleteItem: SyncQueueItem = {
    id: createId('sync'),
    entityType: 'stock-measurement-delete',
    createdAt: timestamp,
    attempts: 0,
    payload: {
      localId: params.localId,
      id_medicao: params.idMedicao,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };

  await writeQueue([deleteItem, ...filteredQueue]);
  await processSyncQueue();
}

export async function getPendingSyncCount() {
  const queue = await readQueue();
  return queue.length;
}

export async function processSyncQueue() {
  // A fila processa em série para evitar conflito de gravação e para simplificar deduplicação.
  if (syncInFlight) {
    return;
  }

  if (!(await isOnline())) {
    scheduleRetry();
    return;
  }

  syncInFlight = true;

  try {
    let queue = await readQueue();

    while (queue.length > 0) {
      const currentItem = queue[0];

      try {
        await uploadQueueItem(currentItem);
        queue = queue.slice(1);
        await writeQueue(queue);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha desconhecida de sincronizacao.';

        const isPermanentError =
          message.includes('Payload legado ou incompleto') ||
          message.includes('Campos obrigatorios ausentes');

        if (currentItem.entityType === 'radio-conference') {
          if (!isRadioConferencePayload(currentItem.payload)) {
            queue = queue.slice(1);
            await writeQueue(queue);
            continue;
          }

          await updateRadioConference(currentItem.payload.localId, (conference) => ({
            ...conference,
            syncStatus: 'error',
            lastError: message,
          }));
        }

        if (currentItem.entityType === 'inventory-count') {
          await updateInventoryCount(currentItem.payload.localId, (count) => ({
            ...count,
            syncStatus: 'error',
            lastError: message,
          }));
        }

        if (currentItem.entityType === 'stock-measurement') {
          await updateStockMeasurement(currentItem.payload.localId, (measurement) => ({
            ...measurement,
            syncStatus: 'error',
            lastError: message,
          }));
        }

        if (currentItem.entityType === 'stock-measurement-delete') {
          scheduleRetry();
        }

        if (isPermanentError) {
          queue = queue.slice(1);
          await writeQueue(queue);
          continue;
        }

        const updatedItem: SyncQueueItem = {
          ...currentItem,
          attempts: currentItem.attempts + 1,
          lastError: message,
        };

        queue = [updatedItem, ...queue.slice(1)];
        await writeQueue(queue);
        scheduleRetry();
        break;
      }
    }
  } finally {
    syncInFlight = false;
  }
}
