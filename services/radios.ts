// Servico de radios.
// Concentra persistencia de imagem, criacao da conferencia e manutencao da base offline de selos.
import * as FileSystem from 'expo-file-system/legacy';

import {
  checkRadioConferenceAlreadyToday,
  fetchRadioCatalog,
  fetchRadioList,
  fetchRadioReport,
  pingSyncApi,
  searchRadioSelos,
} from '@/services/sync/api';
import {
  enqueueSyncItem,
  processSyncQueue,
  saveRadioConferenceLocally,
} from '@/services/sync/queue';
import { readStorage, storageKeys, writeStorage } from '@/services/sync/storage';
import type {
  RadioConferenceImage,
  RadioConferencePayload,
  RadioListItem,
  RadioListResponse,
  RadioLookupCache,
  RadioLookupItem,
  RadioOfflinePreference,
  RadioReportResponse,
  StoredRadioConference,
  SyncQueueItem,
} from '@/services/sync/types';

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory}radio-conference-images`;
const OFFLINE_IMAGE_DIRECTORY = `${FileSystem.documentDirectory}radio-offline-images`;
const RADIO_LOOKUP_CACHE_SCHEMA_VERSION = 4;
const RADIO_CONFERENCE_STATUS_WINDOW_DAYS = 7;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureImageDirectory() {
  const directoryInfo = await FileSystem.getInfoAsync(IMAGE_DIRECTORY);

  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIRECTORY, { intermediates: true });
  }
}

async function ensureOfflineImageDirectory() {
  const directoryInfo = await FileSystem.getInfoAsync(OFFLINE_IMAGE_DIRECTORY);

  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_IMAGE_DIRECTORY, { intermediates: true });
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

function getOfflineImageFileName(item: RadioLookupItem) {
  const sourceName = item.ImagePath || item.ImageUrl || item.RadioSeloComplemento;
  const withoutQuery = sourceName.split('?')[0] || sourceName;
  const lastSegment = withoutQuery.split(/[\\/]/).filter(Boolean).pop() || 'jpg';
  const extension = lastSegment.includes('.') ? lastSegment.split('.').pop() : 'jpg';
  const safeSelo = item.RadioSeloComplemento.trim().replace(/[^a-z0-9_-]/gi, '_') || 'radio';

  return `${safeSelo}.${extension || 'jpg'}`;
}

function getRadioSeloKey(value: string) {
  return value.trim().split('-')[0]?.trim().toUpperCase() || value.trim().toUpperCase();
}

function getRadioSetorValue(item: RadioLookupItem | RadioListItem) {
  return String(item.RadioSetor ?? item.Setor ?? '').trim();
}

function isActiveRadioItem(item: RadioLookupItem) {
  const situacao = item.RadioSituacao?.trim().toUpperCase();

  return situacao === 'ATIVO';
}

async function cacheRadioOfflineImage(item: RadioLookupItem) {
  if (!item.ImageUrl) {
    return item;
  }

  try {
    await ensureOfflineImageDirectory();

    const destinationUri = `${OFFLINE_IMAGE_DIRECTORY}/${getOfflineImageFileName(item)}`;
    await FileSystem.downloadAsync(item.ImageUrl, destinationUri);

    return {
      ...item,
      OfflineImageUri: destinationUri,
    };
  } catch {
    return item;
  }
}

export async function persistRadioConferenceImage(params: {
  sourceUri: string;
  fileName?: string | null;
  mimeType?: string | null;
}) {
  await ensureImageDirectory();

  const extension = getImageExtension(params.fileName, params.mimeType);
  const id = createId('img');
  const destinationUri = `${IMAGE_DIRECTORY}/${id}.${extension}`;

  await FileSystem.copyAsync({
    from: params.sourceUri,
    to: destinationUri,
  });

  const image: RadioConferenceImage = {
    id,
    uri: destinationUri,
    fileName: `${id}.${extension}`,
    mimeType: params.mimeType || `image/${extension}`,
  };

  return image;
}

export async function findRadioSelos(query: string) {
  const sanitizedQuery = query.trim().toUpperCase();

  if (!sanitizedQuery) {
    return [];
  }

  const cached = await readStorage<RadioLookupCache>(storageKeys.radioLookupCache, {
    items: [],
  });
  const cachedResults = cached.items
    .filter(
      (item) =>
        isActiveRadioItem(item) &&
        item.RadioSeloComplemento.trim().toUpperCase().includes(sanitizedQuery),
    )
    .slice(0, 20);

  const cachedResultsHaveUsuario = cachedResults.some((item) => item.Usuario?.trim());

  if (cachedResults.length > 0 && cachedResultsHaveUsuario) {
    return cachedResults;
  }

  try {
    const onlineResults = await searchRadioSelos(query);

    if (onlineResults.length > 0) {
      await mergeRadioLookupCache(onlineResults);
    }

    return onlineResults.filter(isActiveRadioItem);
  } catch {
    return cachedResults;
  }
}

async function mergeRadioLookupCache(items: RadioLookupItem[]) {
  const cached = await readStorage<RadioLookupCache>(storageKeys.radioLookupCache, {
    items: [],
  });
  const mergedMap = new Map<string, RadioLookupItem>();

  [...cached.items, ...items].forEach((item) => {
    const key = item.RadioSeloComplemento.trim().toUpperCase();

    if (!key || !isActiveRadioItem(item)) {
      return;
    }

    mergedMap.set(key, {
      RadioSeloComplemento: item.RadioSeloComplemento,
      Setor: item.Setor ?? null,
      RadioSetor: item.RadioSetor ?? item.Setor ?? null,
      RadioSituacao: item.RadioSituacao ?? null,
      Usuario: item.Usuario ?? null,
      Equipamento: item.Equipamento ?? null,
      ImagePath: item.ImagePath ?? null,
      ImageUrl: item.ImageUrl ?? null,
      OfflineImageUri: item.OfflineImageUri ?? null,
      LastConferenceAt: item.LastConferenceAt ?? null,
      ConferenceStatus: item.ConferenceStatus ?? 'Pendente',
    });
  });

  const mergedItems = Array.from(mergedMap.values()).sort((left, right) =>
    left.RadioSeloComplemento.localeCompare(right.RadioSeloComplemento),
  );

  await writeStorage(storageKeys.radioLookupCache, {
    items: mergedItems,
    updatedAt: new Date().toISOString(),
    schemaVersion: RADIO_LOOKUP_CACHE_SCHEMA_VERSION,
  } satisfies RadioLookupCache);
}

export async function syncOfflineRadioCatalog() {
  let apiAvailable = false;

  try {
    apiAvailable = await pingSyncApi();
  } catch {
    apiAvailable = false;
  }

  if (!apiAvailable) {
    return false;
  }

  const catalog = await fetchRadioCatalog();
  const items = await Promise.all(
    catalog.items.filter(isActiveRadioItem).map(cacheRadioOfflineImage),
  );

  await writeStorage(storageKeys.radioLookupCache, {
    items,
    updatedAt: catalog.updatedAt || new Date().toISOString(),
    schemaVersion: RADIO_LOOKUP_CACHE_SCHEMA_VERSION,
  } satisfies RadioLookupCache);

  return true;
}

export function isOfflineRadioCatalogReady(cache: RadioLookupCache) {
  return (
    cache.items.length > 0 &&
    cache.schemaVersion === RADIO_LOOKUP_CACHE_SCHEMA_VERSION
  );
}

export async function getOfflineRadioCatalogStatus() {
  return readStorage<RadioLookupCache>(storageKeys.radioLookupCache, {
    items: [],
  });
}

function isWithinLastDays(dateValue: string | null | undefined, days: number) {
  if (!dateValue) {
    return false;
  }

  const parsed = new Date(dateValue);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const windowStart = Date.now() - days * 24 * 60 * 60 * 1000;
  return parsed.getTime() >= windowStart;
}

function getLatestLocalConferenceAt(
  conferences: StoredRadioConference[],
  numeroSelo: string,
) {
  const normalizedSelo = getRadioSeloKey(numeroSelo);
  let latestTimestamp = 0;
  let latestDate: string | null = null;

  conferences.forEach((conference) => {
    if (getRadioSeloKey(conference.numeroSelo) !== normalizedSelo) {
      return;
    }

    const timestamp = new Date(conference.createdAt).getTime();

    if (!Number.isNaN(timestamp) && timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestDate = conference.createdAt;
    }
  });

  return latestDate;
}

async function applyLocalRadioConferenceStatus<T extends RadioLookupItem>(
  items: T[],
): Promise<Array<T & RadioListItem>> {
  const localConferences = await readStorage<StoredRadioConference[]>(
    storageKeys.radioConferences,
    [],
  );

  return items.map((item) => {
    const localLastConferenceAt = getLatestLocalConferenceAt(
      localConferences,
      item.RadioSeloComplemento,
    );
    const serverLastConferenceAt = item.LastConferenceAt ?? null;
    const latestConferenceAt =
      localLastConferenceAt &&
      (!serverLastConferenceAt ||
        new Date(localLastConferenceAt).getTime() >
          new Date(serverLastConferenceAt).getTime())
        ? localLastConferenceAt
        : serverLastConferenceAt;
    const conferenceStatus = isWithinLastDays(
      latestConferenceAt,
      RADIO_CONFERENCE_STATUS_WINDOW_DAYS,
    )
      ? 'Conferido'
      : 'Pendente';

    return {
      ...item,
      RadioSetor: item.RadioSetor ?? item.Setor ?? null,
      RadioSituacao: item.RadioSituacao ?? null,
      Equipamento: item.Equipamento ?? null,
      LastConferenceAt: latestConferenceAt,
      ConferenceStatus: conferenceStatus,
    };
  });
}

function filterRadioListItems(
  items: RadioLookupItem[],
  params?: { setor?: string; selo?: string; limit?: number },
) {
  const setor = params?.setor?.trim().toUpperCase();
  const selo = params?.selo?.trim().toUpperCase();

  return items
    .filter((item) => {
      if (!isActiveRadioItem(item)) {
        return false;
      }

      const matchesSetor =
        !setor || getRadioSetorValue(item).toUpperCase().includes(setor);
      const matchesSelo =
        !selo || item.RadioSeloComplemento.trim().toUpperCase().includes(selo);

      return matchesSetor && matchesSelo;
    })
    .slice(0, params?.limit ?? 500);
}

export async function listRadiosForConference(params?: {
  setor?: string;
  selo?: string;
  limit?: number;
}): Promise<RadioListResponse> {
  try {
    const apiAvailable = await pingSyncApi();

    if (!apiAvailable) {
      throw new Error('Servidor indisponivel.');
    }

    const response = await fetchRadioList(params);
    const activeItems = response.items.filter(isActiveRadioItem);
    await mergeRadioLookupCache(activeItems);
    const items = await applyLocalRadioConferenceStatus(activeItems);

    return {
      ...response,
      items,
      total: items.length,
    };
  } catch {
    const cached = await readStorage<RadioLookupCache>(storageKeys.radioLookupCache, {
      items: [],
    });
    const filteredItems = filterRadioListItems(cached.items, params);
    const items = await applyLocalRadioConferenceStatus(filteredItems);

    return {
      items,
      total: items.length,
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function getRadioSetoresForConference() {
  const cached = await readStorage<RadioLookupCache>(storageKeys.radioLookupCache, {
    items: [],
  });
  const setores = Array.from(
    new Set(
      cached.items
        .filter(isActiveRadioItem)
        .map((item) => getRadioSetorValue(item))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, 'pt-BR', { numeric: true }));

  return setores;
}

export async function generateRadioReport(params?: {
  numeroSelo?: string;
  limit?: number;
}): Promise<RadioReportResponse> {
  const apiAvailable = await pingSyncApi();

  if (!apiAvailable) {
    throw new Error('Sem conexao com o servidor para emitir o relatorio de radios.');
  }

  return fetchRadioReport(params);
}

export async function saveRadioOfflinePreference(
  preference: RadioOfflinePreference,
) {
  await writeStorage(storageKeys.radioOfflinePreference, preference);
}

export async function getRadioOfflinePreference() {
  return readStorage<RadioOfflinePreference | null>(
    storageKeys.radioOfflinePreference,
    null,
  );
}

function isSameCalendarDay(dateA: string, dateB: Date) {
  const parsed = new Date(dateA);

  return (
    parsed.getFullYear() === dateB.getFullYear() &&
    parsed.getMonth() === dateB.getMonth() &&
    parsed.getDate() === dateB.getDate()
  );
}

export async function hasRadioConferenceToday(
  numeroSelo: string,
  options?: { checkServer?: boolean },
) {
  const sanitizedNumeroSelo = getRadioSeloKey(numeroSelo);
  const today = new Date();
  const localConferences = await readStorage<StoredRadioConference[]>(
    storageKeys.radioConferences,
    [],
  );

  const existsLocally = localConferences.some(
    (conference) =>
      getRadioSeloKey(conference.numeroSelo) === sanitizedNumeroSelo &&
      isSameCalendarDay(conference.createdAt, today),
  );

  if (existsLocally) {
    return true;
  }

  if (options?.checkServer === false) {
    return false;
  }

  try {
    const apiAvailable = await pingSyncApi();

    if (!apiAvailable) {
      return false;
    }

    const result = await checkRadioConferenceAlreadyToday(sanitizedNumeroSelo);
    return result.alreadyCheckedToday;
  } catch {
    return false;
  }
}

export async function hasRadioConferenceInLastDays(
  numeroSelo: string,
  days = RADIO_CONFERENCE_STATUS_WINDOW_DAYS,
  options?: { checkServer?: boolean },
) {
  const sanitizedNumeroSelo = getRadioSeloKey(numeroSelo);
  const localConferences = await readStorage<StoredRadioConference[]>(
    storageKeys.radioConferences,
    [],
  );

  const existsLocally = localConferences.some(
    (conference) =>
      getRadioSeloKey(conference.numeroSelo) === sanitizedNumeroSelo &&
      isWithinLastDays(conference.createdAt, days),
  );

  if (existsLocally) {
    return true;
  }

  if (options?.checkServer === false) {
    return false;
  }

  try {
    const apiAvailable = await pingSyncApi();

    if (!apiAvailable) {
      return false;
    }

    const result = await checkRadioConferenceAlreadyToday(sanitizedNumeroSelo, {
      days,
    });
    return Boolean(result.alreadyCheckedInWindow ?? result.alreadyCheckedToday);
  } catch {
    return false;
  }
}

export async function createRadioConference(
  payload: Omit<RadioConferencePayload, 'localId' | 'createdAt' | 'updatedAt'>,
  options?: { syncImmediately?: boolean },
) {
  const timestamp = new Date().toISOString();
  const localId = createId('radio');

  const conference: StoredRadioConference = {
    ...payload,
    localId,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: 'pending',
  };

  const queueItem: SyncQueueItem = {
    id: createId('sync'),
    entityType: 'radio-conference',
    createdAt: timestamp,
    attempts: 0,
    payload: conference,
  };

  await saveRadioConferenceLocally(conference);
  await enqueueSyncItem(queueItem);

  if (options?.syncImmediately !== false) {
    await processSyncQueue();
  }

  return conference;
}
