import {
  cancelStockMeasurementLocally,
  processSyncQueue,
  saveStockMeasurementLocally,
  upsertSyncItem,
} from '@/services/sync/queue';
import type {
  StockMeasurementRow,
  StoredStockMeasurement,
  SyncQueueItem,
} from '@/services/sync/types';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMeasurementDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

export function createStockMeasurementSession(params: {
  usuarioMedicao: string;
  usuarioMatricula: string;
  nomeAfericao: string;
  nomeArmazem: string;
}) {
  const now = new Date();
  const idMedicao = `MED-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${Date.now().toString().slice(-6)}`;

  return {
    localId: createId('stock-measurement'),
    idMedicao,
    dataMedicao: formatMeasurementDate(now),
    usuarioMedicao: params.usuarioMedicao,
    usuarioMatricula: params.usuarioMatricula,
    nomeAfericao: params.nomeAfericao,
    nomeArmazem: params.nomeArmazem,
  };
}

export async function persistStockMeasurementProgress(params: {
  localId: string;
  idMedicao: string;
  dataMedicao: string;
  usuarioMedicao: string;
  usuarioMatricula: string;
  nomeAfericao: string;
  nomeArmazem: string;
  rows: StockMeasurementRow[];
}) {
  const timestamp = new Date().toISOString();

  const measurement: StoredStockMeasurement = {
    localId: params.localId,
    id_medicao: params.idMedicao,
    data_medicao: params.dataMedicao,
    usuario_medicao: params.usuarioMedicao,
    usuario_matricula: params.usuarioMatricula,
    nome_afericao: params.nomeAfericao,
    nome_armazem: params.nomeArmazem,
    rows: params.rows,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: 'pending',
  };

  const queueItem: SyncQueueItem = {
    id: createId('sync'),
    entityType: 'stock-measurement',
    createdAt: timestamp,
    attempts: 0,
    payload: measurement,
  };

  await saveStockMeasurementLocally(measurement);
  await upsertSyncItem(queueItem);
  await processSyncQueue();

  return measurement;
}

export async function cancelStockMeasurementSession(params: {
  localId: string;
  idMedicao: string;
}) {
  await cancelStockMeasurementLocally({
    localId: params.localId,
    idMedicao: params.idMedicao,
  });
}
