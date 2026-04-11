// Tipos compartilhados entre telas, fila offline e cliente de API.
// Mantê-los centralizados evita drift entre payload salvo localmente e payload enviado ao backend.
export type SyncEntityType =
  | 'radio-conference'
  | 'inventory-count'
  | 'stock-measurement';

export type RadioConferenceImage = {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
};

export type RadioConferencePayload = {
  localId: string;
  numeroSelo: string;
  usuarioNome: string;
  equipamentoOperante: string;
  botaoFunciona: string;
  bateriaEncaixa: string;
  existemRachaduras: string;
  riscosProfundos: string;
  capaProtetora: string;
  alcaTransporte: string;
  identificacaoIntegra: string;
  equipamentoLimpo: string;
  situacaoGeral: string;
  observacao: string;
  images: RadioConferenceImage[];
  createdAt: string;
  updatedAt: string;
};

export type InventoryCountImage = {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
};

export type InventoryProductLookup = {
  ProdutoCodigoBarras?: string | null;
  ProdutoDescricao?: string | null;
  ProdutoCodigo?: string | null;
  ProdutoSessao?: string | null;
  ProdutoPrateleira?: string | null;
  ProdutoTabua?: string | null;
  ProdutoItem?: string | null;
  ProdutoQuantidade?: string | number | null;
  ProdutoValorEstoque?: string | number | null;
  ProdutoDataUltimaVenda?: string | null;
  ProdutoQTDE_VendaMes?: string | number | null;
  ProdutoDataUltimaCompra?: string | null;
  ProdutoQTDEUltimaCompra?: string | number | null;
  ProdutoVLRUltimaCompra?: string | number | null;
};

export type InventoryProductCache = {
  items: InventoryProductLookup[];
  updatedAt?: string;
};

export type InventoryOfflinePreference = {
  mode: 'online' | 'offline';
  skipPrompt: boolean;
};

export type InventoryCountPayload = {
  localId: string;
  codigoBarras: string;
  codigoProduto: string;
  quantidadeFisica: string;
  observacao: string;
  usuarioNome: string;
  usuarioMatricula: string;
  image: InventoryCountImage | null;
  productSnapshot: InventoryProductLookup | null;
  createdAt: string;
  updatedAt: string;
};

export type StockMeasurementSide = 'DIREITO' | 'ESQUERDO';

export type StockMeasurementRow = {
  id_medicao: string;
  data_medicao: string;
  usuario_medicao: string;
  nome_afericao: string;
  nome_armazem: string;
  lado_medicao: StockMeasurementSide;
  arco: number;
  angulo_graus: string;
  medida_metros: string;
};

export type StockMeasurementPayload = {
  localId: string;
  id_medicao: string;
  data_medicao: string;
  usuario_medicao: string;
  usuario_matricula: string;
  nome_afericao: string;
  nome_armazem: string;
  rows: StockMeasurementRow[];
  createdAt: string;
  updatedAt: string;
};

export type SyncQueueItem = {
  id: string;
  entityType: SyncEntityType;
  createdAt: string;
  attempts: number;
  lastError?: string;
  payload: RadioConferencePayload | InventoryCountPayload | StockMeasurementPayload;
};

export type StoredRadioConference = RadioConferencePayload & {
  syncStatus: 'pending' | 'synced' | 'error';
  syncedAt?: string;
  lastError?: string;
};

export type StoredInventoryCount = InventoryCountPayload & {
  syncStatus: 'pending' | 'synced' | 'error';
  syncedAt?: string;
  lastError?: string;
};

export type StoredStockMeasurement = StockMeasurementPayload & {
  syncStatus: 'pending' | 'synced' | 'error';
  syncedAt?: string;
  lastError?: string;
};

export type RadioLookupItem = {
  RadioSeloComplemento: string;
  Setor?: string | null;
  RadioSetor?: string | number | null;
  RadioSituacao?: string | null;
  Usuario?: string | null;
  Equipamento?: string | null;
  ImagePath?: string | null;
  ImageUrl?: string | null;
  OfflineImageUri?: string | null;
  LastConferenceAt?: string | null;
  ConferenceStatus?: 'Pendente' | 'Conferido';
};

export type RadioLookupCache = {
  items: RadioLookupItem[];
  updatedAt?: string;
  schemaVersion?: number;
};

export type RadioListItem = RadioLookupItem & {
  RadioSetor?: string | number | null;
  Equipamento?: string | null;
  LastConferenceAt?: string | null;
  ConferenceStatus: 'Pendente' | 'Conferido';
};

export type RadioListResponse = {
  items: RadioListItem[];
  total: number;
  generatedAt: string;
};

export type RadioOfflinePreference = {
  mode: 'online' | 'offline';
  skipPrompt: boolean;
};

export type RadioReportItem = {
  numeroSelo: string;
  dimRadios: Record<string, unknown> | null;
  conferenciaRadios: Record<string, unknown> | null;
  fotosUltimaConferencia: string[];
};

export type RadioReportResponse = {
  items: RadioReportItem[];
  total: number;
  generatedAt: string;
};

export type RadioRegistryColumn = {
  name: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
};

export type RadioRegistrySchema = {
  dimRadios: RadioRegistryColumn[];
  fatoUsuariosRadios: RadioRegistryColumn[];
  primaryKey: string;
  ownerForeignKey: string;
};

export type RadioRegistryOwner = {
  MatriculaUsuario: string;
  NomeUsuario: string;
};

export type RadioRegistryRecord = {
  dimRadios: Record<string, string>;
  owners: RadioRegistryOwner[];
};

export type RadioRegistryListItem = {
  selo: string;
  modelo: string;
  setor: string;
  situacao: string;
  equipamento: string;
  owners: RadioRegistryOwner[];
};
