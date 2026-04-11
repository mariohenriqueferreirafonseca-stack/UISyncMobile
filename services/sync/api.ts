// Cliente HTTP central do app.
// Toda chamada ao backend passa por aqui para manter URL-base e contratos concentrados.
import type { AuthSession } from '@/services/auth';
import type {
  InventoryCountPayload,
  InventoryProductCache,
  InventoryProductLookup,
  RadioConferencePayload,
  RadioListResponse,
  RadioRegistryListItem,
  RadioRegistryRecord,
  RadioRegistrySchema,
  RadioLookupCache,
  RadioLookupItem,
  RadioReportResponse,
  StockMeasurementPayload,
} from '@/services/sync/types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || '';

export function getApiBaseUrl() {
  // Exposto principalmente para diagnóstico visual no login e para futuras telas de suporte.
  return API_BASE_URL;
}

function buildUrl(path: string) {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_URL nao foi definida para este build.');
  }

  return `${API_BASE_URL}${path}`;
}

export async function searchRadioSelos(query: string): Promise<RadioLookupItem[]> {
  const sanitizedQuery = query.trim();

  if (!sanitizedQuery) {
    return [];
  }

  const response = await fetch(
    buildUrl(`/api/radios/search?query=${encodeURIComponent(sanitizedQuery)}`),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error('Nao foi possivel consultar os radios.');
  }

  return (await response.json()) as RadioLookupItem[];
}

export async function fetchRadioCatalog(): Promise<RadioLookupCache> {
  const response = await fetch(buildUrl('/api/radios/catalog'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Nao foi possivel atualizar a base offline de radios.');
  }

  return (await response.json()) as RadioLookupCache;
}

export async function fetchRadioList(params?: {
  setor?: string;
  selo?: string;
  limit?: number;
}): Promise<RadioListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.setor?.trim()) {
    searchParams.set('setor', params.setor.trim());
  }

  if (params?.selo?.trim()) {
    searchParams.set('selo', params.selo.trim());
  }

  if (params?.limit) {
    searchParams.set('limit', String(params.limit));
  }

  const query = searchParams.toString();
  const response = await fetch(
    buildUrl(`/api/radios/list${query ? `?${query}` : ''}`),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel listar os radios.');
  }

  return (await response.json()) as RadioListResponse;
}

export async function fetchRadioRegistrySchema(): Promise<RadioRegistrySchema> {
  const response = await fetch(buildUrl('/api/radios/registry/schema'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel carregar o schema do cadastro de radios.');
  }

  return (await response.json()) as RadioRegistrySchema;
}

export async function fetchRadioRegistryList(query?: string): Promise<RadioRegistryListItem[]> {
  const searchParams = new URLSearchParams();

  if (query?.trim()) {
    searchParams.set('query', query.trim());
  }

  const response = await fetch(
    buildUrl(`/api/radios/registry${searchParams.toString() ? `?${searchParams.toString()}` : ''}`),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel listar os radios cadastrados.');
  }

  return (await response.json()) as RadioRegistryListItem[];
}

export async function fetchRadioRegistryBySelo(selo: string): Promise<RadioRegistryRecord> {
  const response = await fetch(
    buildUrl(`/api/radios/registry/${encodeURIComponent(selo.trim())}`),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel carregar o cadastro do radio.');
  }

  return (await response.json()) as RadioRegistryRecord;
}

export async function createRadioRegistry(payload: RadioRegistryRecord) {
  const response = await fetch(buildUrl('/api/radios/registry'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel cadastrar o radio.');
  }

  return (await response.json()) as { ok: true; selo: string };
}

export async function updateRadioRegistry(
  currentSelo: string,
  payload: RadioRegistryRecord,
) {
  const response = await fetch(
    buildUrl(`/api/radios/registry/${encodeURIComponent(currentSelo.trim())}`),
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel atualizar o cadastro do radio.');
  }

  return (await response.json()) as { ok: true; selo: string };
}

export async function fetchRadioReport(params?: {
  numeroSelo?: string;
  limit?: number;
}): Promise<RadioReportResponse> {
  const searchParams = new URLSearchParams();

  if (params?.numeroSelo?.trim()) {
    searchParams.set('numeroSelo', params.numeroSelo.trim());
  }

  if (params?.limit) {
    searchParams.set('limit', String(params.limit));
  }

  const query = searchParams.toString();
  const response = await fetch(
    buildUrl(`/api/relatorios/radios${query ? `?${query}` : ''}`),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel emitir o relatorio de radios.');
  }

  return (await response.json()) as RadioReportResponse;
}

export async function checkRadioConferenceAlreadyToday(
  numeroSelo: string,
  params?: { days?: number },
) {
  const searchParams = new URLSearchParams({
    numeroSelo: numeroSelo.trim(),
  });

  if (params?.days) {
    searchParams.set('days', String(params.days));
  }

  const response = await fetch(
    buildUrl(`/api/conferencias/radios/check?${searchParams.toString()}`),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error('Nao foi possivel validar a conferencia do dia.');
  }

  return (await response.json()) as {
    alreadyCheckedToday: boolean;
    alreadyCheckedInWindow?: boolean;
    days?: number;
  };
}

export async function uploadRadioConference(payload: RadioConferencePayload) {
  const formData = new FormData();

  formData.append('localId', payload.localId);
  formData.append('numeroSelo', payload.numeroSelo);
  formData.append('usuarioNome', payload.usuarioNome);
  formData.append('equipamentoOperante', payload.equipamentoOperante);
  formData.append('botaoFunciona', payload.botaoFunciona);
  formData.append('bateriaEncaixa', payload.bateriaEncaixa);
  formData.append('existemRachaduras', payload.existemRachaduras);
  formData.append('riscosProfundos', payload.riscosProfundos);
  formData.append('capaProtetora', payload.capaProtetora);
  formData.append('alcaTransporte', payload.alcaTransporte);
  formData.append('identificacaoIntegra', payload.identificacaoIntegra);
  formData.append('equipamentoLimpo', payload.equipamentoLimpo);
  formData.append('situacaoGeral', payload.situacaoGeral);
  formData.append('observacao', payload.observacao);
  formData.append('createdAt', payload.createdAt);
  formData.append('updatedAt', payload.updatedAt);

  payload.images.forEach((image) => {
    formData.append('images', {
      uri: image.uri,
      name: image.fileName,
      type: image.mimeType,
    } as never);
  });

  const response = await fetch(buildUrl('/api/conferencias/radios'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Falha ao enviar conferencia de radios.');
  }
}

export async function lookupInventoryProductByBarcode(
  codigoBarras: string,
): Promise<InventoryProductLookup> {
  const response = await fetch(
    buildUrl(`/api/almox/produtos/by-barcode/${encodeURIComponent(codigoBarras.trim())}`),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel consultar o produto.');
  }

  return (await response.json()) as InventoryProductLookup;
}

export async function fetchInventoryCatalog(): Promise<InventoryProductCache> {
  const response = await fetch(buildUrl('/api/almox/produtos/catalog'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel baixar a base offline de produtos.');
  }

  return (await response.json()) as InventoryProductCache;
}

export async function uploadInventoryCount(payload: InventoryCountPayload) {
  const formData = new FormData();

  formData.append('localId', payload.localId);
  formData.append('codigoBarras', payload.codigoBarras);
  formData.append('codigoProduto', payload.codigoProduto);
  formData.append('quantidadeFisica', payload.quantidadeFisica);
  formData.append('observacao', payload.observacao);
  formData.append('usuarioNome', payload.usuarioNome);
  formData.append('usuarioMatricula', payload.usuarioMatricula);
  formData.append('createdAt', payload.createdAt);
  formData.append('updatedAt', payload.updatedAt);

  if (payload.image) {
    formData.append('foto', {
      uri: payload.image.uri,
      name: payload.image.fileName,
      type: payload.image.mimeType,
    } as never);
  }

  const response = await fetch(buildUrl('/api/almox/contagens'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Falha ao enviar contagem do inventario.');
  }
}

export async function uploadStockMeasurement(payload: StockMeasurementPayload) {
  const response = await fetch(buildUrl('/api/pcp/medicoes-estoque'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Falha ao enviar medicao de estoque.');
  }
}

export async function pingSyncApi() {
  const response = await fetch(buildUrl('/health'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  return response.ok;
}

export async function debugHealthCheck() {
  try {
    const response = await fetch(buildUrl('/health'), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: text,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: error instanceof Error ? error.message : 'Falha desconhecida no fetch.',
    };
  }
}

export async function loginWithDatabase(params: {
  matricula: string;
  senha: string;
}) {
  const response = await fetch(buildUrl('/api/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Nao foi possivel realizar o login.');
  }

  return (await response.json()) as AuthSession;
}
