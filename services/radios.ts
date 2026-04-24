// Servico de radios.
// Concentra persistencia de imagem, criacao da conferencia e manutencao da base offline de selos.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  checkRadioConferenceAlreadyToday,
  fetchRadioCatalog,
  fetchRadioList,
  fetchRadioReport,
  pingSyncApi,
  searchRadioSelos,
} from '@/services/sync/api';
import {
  processSyncQueue,
  saveRadioConferenceLocally,
  upsertSyncItem,
} from '@/services/sync/queue';
import { readStorage, storageKeys, writeStorage } from '@/services/sync/storage';
import type {
  RadioConferenceEditableData,
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

function sanitizeFileNamePart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
}

function formatConferenceFileDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'data-invalida';
  }

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = String(parsed.getFullYear());

  return `${day}-${month}-${year}`;
}

function buildRadioConferenceImageBaseName(params: {
  numeroSelo: string;
  createdAt: string;
}) {
  const safeNumeroSelo = sanitizeFileNamePart(params.numeroSelo) || 'radio';
  const datePart = formatConferenceFileDate(params.createdAt);

  return `${safeNumeroSelo}-${datePart}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRadioConferenceImageSlot(params: {
  fileName?: string | null;
  numeroSelo: string;
  createdAt: string;
}) {
  const sanitizedFileName = sanitizeFileNamePart(params.fileName || '');

  if (!sanitizedFileName) {
    return null;
  }

  const baseName = buildRadioConferenceImageBaseName(params);
  const match = sanitizedFileName.match(
    new RegExp(`^${escapeRegExp(baseName)}(?:-(\\d{2}))?\\.[^.]+$`, 'i'),
  );

  if (!match) {
    return null;
  }

  return match[1] ? Math.max(Number(match[1]) - 1, 0) : 0;
}

function takeNextAvailableRadioConferenceImageSlot(usedSlots: Set<number>) {
  let nextSlot = 0;

  while (usedSlots.has(nextSlot)) {
    nextSlot += 1;
  }

  usedSlots.add(nextSlot);
  return nextSlot;
}

function buildRadioConferenceImageFileName(params: {
  numeroSelo: string;
  createdAt: string;
  slot: number;
  fileName?: string | null;
  mimeType?: string | null;
}) {
  const baseName = buildRadioConferenceImageBaseName(params);
  const sourceExtension = sanitizeFileNamePart(
    getImageExtension(params.fileName, params.mimeType) || 'jpg',
  ).replace(/\./g, '');
  const extension = !sourceExtension || sourceExtension === 'jpeg' ? 'jpg' : sourceExtension;
  const sequenceSuffix =
    params.slot > 0 ? `-${String(params.slot + 1).padStart(2, '0')}` : '';

  return `${baseName}${sequenceSuffix}.${extension}`;
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

function normalizeRecordString(value: unknown) {
  return String(value ?? '').trim();
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
  const extension = getImageExtension(params.fileName, params.mimeType);
  const id = createId('img');

  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    return {
      id,
      uri: params.sourceUri,
      fileName: params.fileName || `${id}.${extension}`,
      mimeType: params.mimeType || `image/${extension}`,
    } satisfies RadioConferenceImage;
  }

  await ensureImageDirectory();

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

async function prepareRadioConferenceImagesForSave(
  images: RadioConferenceImage[],
  params: { numeroSelo: string; createdAt: string },
) {
  const preparedImages: RadioConferenceImage[] = [];
  const usedSlots = new Set<number>();

  images.forEach((image) => {
    if (!image.isExisting) {
      return;
    }

    const slot = getRadioConferenceImageSlot({
      fileName: image.fileName,
      numeroSelo: params.numeroSelo,
      createdAt: params.createdAt,
    });

    if (slot !== null) {
      usedSlots.add(slot);
    }
  });

  for (const image of images) {
    if (image.isExisting) {
      preparedImages.push(image);
      continue;
    }

    const currentSlot = getRadioConferenceImageSlot({
      fileName: image.fileName,
      numeroSelo: params.numeroSelo,
      createdAt: params.createdAt,
    });
    const slot =
      currentSlot !== null && !usedSlots.has(currentSlot)
        ? (usedSlots.add(currentSlot), currentSlot)
        : takeNextAvailableRadioConferenceImageSlot(usedSlots);
    const fileName = buildRadioConferenceImageFileName({
      numeroSelo: params.numeroSelo,
      createdAt: params.createdAt,
      slot,
      fileName: image.fileName,
      mimeType: image.mimeType,
    });

    if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
      preparedImages.push({
        ...image,
        fileName,
      });
      continue;
    }

    await ensureImageDirectory();

    const destinationUri = `${IMAGE_DIRECTORY}/${fileName}`;

    if (image.uri === destinationUri) {
      preparedImages.push({
        ...image,
        fileName,
      });
      continue;
    }

    try {
      const sourceInfo = await FileSystem.getInfoAsync(image.uri);

      if (sourceInfo.exists) {
        const destinationInfo = await FileSystem.getInfoAsync(destinationUri);

        if (!destinationInfo.exists) {
          await FileSystem.moveAsync({
            from: image.uri,
            to: destinationUri,
          });
        }

        preparedImages.push({
          ...image,
          uri: destinationUri,
          fileName,
        });
        continue;
      }
    } catch {
      // Se nao der para renomear o arquivo local, ainda mantemos o nome final
      // usado no upload para preservar o padrao da conferencia.
    }

    preparedImages.push({
      ...image,
      fileName,
    });
  }

  return preparedImages;
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

function getStoredConferenceEffectiveDate(conference: {
  updatedAt?: string | null;
  createdAt?: string | null;
}) {
  return conference.updatedAt || conference.createdAt || null;
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

    const timestamp = new Date(
      getStoredConferenceEffectiveDate(conference) || conference.createdAt,
    ).getTime();

    if (!Number.isNaN(timestamp) && timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestDate = getStoredConferenceEffectiveDate(conference) || conference.createdAt;
    }
  });

  return latestDate;
}

function shouldUseLocalConferenceAsStatusOverride(
  conference: StoredRadioConference,
) {
  return conference.syncStatus !== 'synced';
}

async function applyLocalRadioConferenceStatus<T extends RadioLookupItem>(
  items: T[],
): Promise<Array<T & RadioListItem>> {
  const localConferences = await readStorage<StoredRadioConference[]>(
    storageKeys.radioConferences,
    [],
  );
  const pendingLocalConferences = localConferences.filter(
    shouldUseLocalConferenceAsStatusOverride,
  );

  return items.map((item) => {
    const localLastConferenceAt = getLatestLocalConferenceAt(
      pendingLocalConferences,
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

function inferMimeTypeFromFileName(fileName?: string | null) {
  const extension = (getImageExtension(fileName, null) || 'jpg').toLowerCase();

  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

function extractImageFileNameFromUrl(url: string, fallback: string) {
  const withoutQuery = url.split('?')[0] || url;
  const lastSegment = withoutQuery.split('/').filter(Boolean).pop();

  return lastSegment ? decodeURIComponent(lastSegment) : fallback;
}

function parseStringArrayField(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRecordString(item)).filter(Boolean);
  }

  const sanitized = normalizeRecordString(value);

  if (!sanitized) {
    return [];
  }

  try {
    const parsed = JSON.parse(sanitized);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalizeRecordString(item)).filter(Boolean);
    }
  } catch {
    // Campo pode vir como string simples no banco ou no fallback local.
  }

  return [sanitized];
}

function buildExistingConferenceImages(params: {
  urls: string[];
  imageNames: string[];
}) {
  return params.urls.map((uri, index) => {
    const fileName =
      params.imageNames[index] ||
      extractImageFileNameFromUrl(uri, `radio-conference-${index + 1}.jpg`);

    return {
      id: `existing-${index}-${fileName}`,
      uri,
      fileName,
      mimeType: inferMimeTypeFromFileName(fileName),
      isExisting: true,
    } satisfies RadioConferenceImage;
  });
}

function getLatestLocalConferenceRecord(
  conferences: StoredRadioConference[],
  numeroSelo: string,
) {
  const normalizedSelo = getRadioSeloKey(numeroSelo);
  let latestConference: StoredRadioConference | null = null;
  let latestTimestamp = 0;

  conferences.forEach((conference) => {
    if (getRadioSeloKey(conference.numeroSelo) !== normalizedSelo) {
      return;
    }

    const timestamp = new Date(
      getStoredConferenceEffectiveDate(conference) || conference.createdAt,
    ).getTime();

    if (!Number.isNaN(timestamp) && timestamp >= latestTimestamp) {
      latestTimestamp = timestamp;
      latestConference = conference;
    }
  });

  return latestConference;
}

function getConferenceEditableTimestamp(value: {
  updatedAt?: string | null;
  createdAt?: string | null;
}) {
  return new Date(value.updatedAt || value.createdAt || '').getTime();
}

function mapStoredConferenceToEditableData(
  conference: StoredRadioConference,
): RadioConferenceEditableData {
  return {
    localId: conference.localId,
    numeroSelo: conference.numeroSelo,
    equipamentoOperante: conference.equipamentoOperante,
    botaoFunciona: conference.botaoFunciona,
    bateriaEncaixa: conference.bateriaEncaixa,
    existemRachaduras: conference.existemRachaduras,
    riscosProfundos: conference.riscosProfundos,
    capaProtetora: conference.capaProtetora,
    alcaTransporte: conference.alcaTransporte,
    identificacaoIntegra: conference.identificacaoIntegra,
    equipamentoLimpo: conference.equipamentoLimpo,
    situacaoGeral: conference.situacaoGeral,
    observacao: conference.observacao,
    images: conference.images,
    createdAt: conference.createdAt,
    updatedAt: conference.updatedAt,
  };
}

function mapReportItemToEditableData(
  item: RadioReportResponse['items'][number] | null | undefined,
): RadioConferenceEditableData | null {
  const record =
    item?.conferenciaRadios && typeof item.conferenciaRadios === 'object'
      ? (item.conferenciaRadios as Record<string, unknown>)
      : null;

  if (!item || !record) {
    return null;
  }

  const createdAt =
    normalizeRecordString(record.DataCriacaoApp) ||
    normalizeRecordString(record.DataAtualizacaoApp) ||
    normalizeRecordString(record.DataRecebimentoServidor);
  const updatedAt =
    normalizeRecordString(record.DataAtualizacaoApp) ||
    normalizeRecordString(record.DataRecebimentoServidor) ||
    createdAt;

  if (!createdAt) {
    return null;
  }

  const imageNames = parseStringArrayField(record.ImageNames);
  const imageUrls = Array.isArray(item.fotosUltimaConferencia)
    ? item.fotosUltimaConferencia.filter(Boolean)
    : [];

  return {
    localId:
      normalizeRecordString(record.LocalId) ||
      `server-${getRadioSeloKey(item.numeroSelo)}-${createdAt}`,
    numeroSelo: normalizeRecordString(record.NumeroSelo) || getRadioSeloKey(item.numeroSelo),
    equipamentoOperante: normalizeRecordString(record.EquipamentoOperante),
    botaoFunciona: normalizeRecordString(record.BotaoFunciona),
    bateriaEncaixa: normalizeRecordString(record.BateriaEncaixa),
    existemRachaduras: normalizeRecordString(record.ExistemRachaduras),
    riscosProfundos: normalizeRecordString(record.RiscosProfundos),
    capaProtetora: normalizeRecordString(record.CapaProtetora),
    alcaTransporte: normalizeRecordString(record.AlcaTransporte),
    identificacaoIntegra: normalizeRecordString(record.IdentificacaoIntegra),
    equipamentoLimpo: normalizeRecordString(record.EquipamentoLimpo),
    situacaoGeral: normalizeRecordString(record.SituacaoGeral),
    observacao: normalizeRecordString(record.Observacao),
    images: buildExistingConferenceImages({
      urls: imageUrls,
      imageNames,
    }),
    createdAt,
    updatedAt: updatedAt || createdAt,
  };
}

export async function getLatestRadioConferenceForEdit(numeroSelo: string) {
  const sanitizedNumeroSelo = getRadioSeloKey(numeroSelo);

  if (!sanitizedNumeroSelo) {
    return null;
  }

  const localConferences = await readStorage<StoredRadioConference[]>(
    storageKeys.radioConferences,
    [],
  );
  const latestLocalConference = getLatestLocalConferenceRecord(
    localConferences,
    sanitizedNumeroSelo,
  );
  let latestServerConference: RadioConferenceEditableData | null = null;

  try {
    const report = await fetchRadioReport({
      numeroSelo: sanitizedNumeroSelo,
      limit: 1,
    });

    latestServerConference = mapReportItemToEditableData(report.items[0]);
  } catch {
    latestServerConference = null;
  }

  const localEditableConference = latestLocalConference
    ? mapStoredConferenceToEditableData(latestLocalConference)
    : null;

  if (!localEditableConference) {
    return latestServerConference;
  }

  if (!latestServerConference) {
    return localEditableConference;
  }

  return getConferenceEditableTimestamp(localEditableConference) >=
    getConferenceEditableTimestamp(latestServerConference)
    ? localEditableConference
    : latestServerConference;
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
      isSameCalendarDay(
        getStoredConferenceEffectiveDate(conference) || conference.createdAt,
        today,
      ),
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
      isWithinLastDays(
        getStoredConferenceEffectiveDate(conference) || conference.createdAt,
        days,
      ),
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
  options?: {
    syncImmediately?: boolean;
    existingLocalId?: string | null;
    createdAt?: string | null;
  },
) {
  const timestamp = new Date().toISOString();
  const createdAt =
    options?.createdAt && !Number.isNaN(new Date(options.createdAt).getTime())
      ? options.createdAt
      : timestamp;
  const localId = options?.existingLocalId?.trim() || createId('radio');
  const preparedImages = await prepareRadioConferenceImagesForSave(payload.images, {
    numeroSelo: payload.numeroSelo,
    createdAt,
  });

  const conference: StoredRadioConference = {
    ...payload,
    images: preparedImages,
    localId,
    createdAt,
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
  await upsertSyncItem(queueItem);

  if (options?.syncImmediately !== false) {
    await processSyncQueue();
  }

  return conference;
}
