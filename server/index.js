require('dotenv').config();

const cors = require('cors');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { getPool, sql } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const almoxDatabaseName = String(process.env.ALMOX_DB_NAME || 'Almox').replace(/]/g, ']]');
const localDataDirectory = path.join(__dirname, 'data');
const localRadioFallbackPath = path.join(localDataDirectory, 'radio-conferences.json');
const localInventoryFallbackPath = path.join(localDataDirectory, 'inventory-counts.json');
const localStockMeasurementFallbackPath = path.join(
  localDataDirectory,
  'stock-measurements.json',
);
const stockMeasurementTableName = 'base_aferi\u00E7\u00E3o_estoque';
const RADIO_REGISTRY_DELETE_PASSWORD = 'dominacaoglobal';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 10,
  },
});
const RADIO_CONFERENCE_STATUS_WINDOW_DAYS = 7;

const inventoryProductTableCandidates = [
  { schema: 'dbo', name: 'BaseProdutos' },
  { schema: 'dbo', name: 'Produtos' },
  { schema: 'dbo', name: 'dimProdutos' },
  { schema: 'dbo', name: 'vwBaseProdutos' },
];

const inventoryCountTableCandidates = [
  { schema: 'dbo', name: 'ContagemProduto' },
  { schema: 'dbo', name: 'ContagemInventario' },
  { schema: 'dbo', name: 'ContagensInventario' },
  { schema: 'dbo', name: 'InventarioContagens' },
  { schema: 'dbo', name: 'AlmoxContagens' },
];

function log(scope, message, detail) {
  const timestamp = new Date().toISOString();
  const suffix = detail ? ` | ${detail}` : '';
  console.log(`[${timestamp}] [${scope}] ${message}${suffix}`);
}

function formatErrorDetail(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function escapeIdentifier(value) {
  return `[${String(value).replace(/]/g, ']]')}]`;
}

function qualifyTableName(schemaName, tableName, databaseName) {
  const parts = [];

  if (databaseName) {
    parts.push(escapeIdentifier(databaseName));
  }

  parts.push(escapeIdentifier(schemaName), escapeIdentifier(tableName));
  return parts.join('.');
}

function buildDbPrefix(databaseName) {
  if (!databaseName) {
    return '';
  }

  return `${escapeIdentifier(databaseName)}.`;
}

function buildObjectId(schemaName, tableName, databaseName) {
  const scopedName = `${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}`;
  return databaseName ? `${escapeIdentifier(databaseName)}.${scopedName}` : scopedName;
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeNullableString(value) {
  const sanitized = normalizeString(value);
  return sanitized ? sanitized : null;
}

function normalizeWindowsEnvPath(value) {
  const sanitized = normalizeString(value);

  if (!sanitized) {
    return sanitized;
  }

  const collapsed = sanitized.replace(/\\\\/g, '\\');
  return path.win32.normalize(collapsed);
}

const radioImagesDirectory = normalizeWindowsEnvPath(
  process.env.RADIO_IMAGES_DIR ||
    '\\\\192.168.176.19\\Aplicativos\\UISyncMobile\\ConferenciaRadiosImagens',
);
const almoxImagesDirectory = normalizeWindowsEnvPath(
  process.env.ALMOX_IMAGES_DIR || path.join(__dirname, 'data', 'almox-images'),
);

function toDateOrNow(value) {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseDateOnly(value) {
  const sanitized = normalizeString(value);

  if (!sanitized) {
    return null;
  }

  const match = sanitized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    return new Date(`${year}-${month}-${day}T00:00:00`);
  }

  const parsed = new Date(sanitized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toFloatOrNull(value) {
  const sanitized = normalizeString(value).replace(',', '.');

  if (!sanitized) {
    return null;
  }

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function appendLocalFallback(filePath, payload) {
  ensureDirectory(path.dirname(filePath));
  let existingItems = [];

  if (fs.existsSync(filePath)) {
    try {
      existingItems = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      existingItems = [];
    }
  }

  existingItems.unshift(payload);
  fs.writeFileSync(filePath, JSON.stringify(existingItems, null, 2));
}

function upsertLocalFallback(filePath, payload, keyName) {
  ensureDirectory(path.dirname(filePath));
  let existingItems = [];

  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      existingItems = Array.isArray(parsed) ? parsed : [];
    } catch {
      existingItems = [];
    }
  }

  const keyValue = normalizeString(payload?.[keyName]);
  const filteredItems =
    keyValue
      ? existingItems.filter((item) => normalizeString(item?.[keyName]) !== keyValue)
      : existingItems;

  filteredItems.unshift(payload);
  fs.writeFileSync(filePath, JSON.stringify(filteredItems, null, 2));
}

function readLocalFallback(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalFallback(filePath, items) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
}

function removeLocalFallbackItems(filePath, predicate) {
  const existingItems = readLocalFallback(filePath);
  writeLocalFallback(
    filePath,
    existingItems.filter((item) => !predicate(item)),
  );
}

function normalizePathSlashes(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function getPublicBaseUrl(request) {
  const configuredBaseUrl = normalizeString(process.env.EXPO_PUBLIC_API_URL);

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  return `${request.protocol}://${request.get('host')}`;
}

function buildRadioImageUrl(request, filePath) {
  const normalizedPath = normalizeString(filePath);

  if (!normalizedPath) {
    return null;
  }

  const fileName = path.basename(normalizedPath);

  if (!fileName) {
    return null;
  }

  return `${getPublicBaseUrl(request)}/api/radio-images/${encodeURIComponent(fileName)}`;
}

async function getColumnNames(pool, schemaName, tableName, databaseName) {
  const dbPrefix = buildDbPrefix(databaseName);
  const objectId = buildObjectId(schemaName, tableName, databaseName).replace(/'/g, "''");
  const result = await pool
    .request()
    .query(`
      SELECT c.name
      FROM ${dbPrefix}sys.columns AS c
      WHERE c.object_id = OBJECT_ID(N'${objectId}')
    `);

  return result.recordset.map((row) => row.name);
}

async function getTableSchema(pool, schemaName, tableName, databaseName) {
  const dbPrefix = buildDbPrefix(databaseName);
  const result = await pool
    .request()
    .input('schemaName', sql.NVarChar, schemaName)
    .input('tableName', sql.NVarChar, tableName)
    .query(`
      SELECT
        isc.COLUMN_NAME AS name,
        isc.DATA_TYPE AS dataType,
        CASE WHEN isc.IS_NULLABLE = 'YES' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS isNullable,
        isc.ORDINAL_POSITION AS ordinalPosition,
        CASE WHEN sc.is_identity = 1 THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS isIdentity,
        CASE WHEN sc.is_computed = 1 THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS isComputed
      FROM ${dbPrefix}INFORMATION_SCHEMA.COLUMNS AS isc
      INNER JOIN ${dbPrefix}sys.tables AS st
        ON st.name = isc.TABLE_NAME
      INNER JOIN ${dbPrefix}sys.schemas AS ss
        ON ss.schema_id = st.schema_id
       AND ss.name = isc.TABLE_SCHEMA
      INNER JOIN ${dbPrefix}sys.columns AS sc
        ON sc.object_id = st.object_id
       AND sc.name = isc.COLUMN_NAME
      WHERE isc.TABLE_SCHEMA = @schemaName
        AND isc.TABLE_NAME = @tableName
      ORDER BY isc.ORDINAL_POSITION
    `);

  return result.recordset.map((row) => ({
    name: row.name,
    dataType: row.dataType,
    isNullable: Boolean(row.isNullable),
    ordinalPosition: Number(row.ordinalPosition),
    isIdentity: Boolean(row.isIdentity),
    isComputed: Boolean(row.isComputed),
  }));
}

async function findExistingTable(pool, candidates, databaseName) {
  const dbPrefix = buildDbPrefix(databaseName);

  for (const candidate of candidates) {
    const result = await pool
      .request()
      .input('schemaName', sql.NVarChar, candidate.schema)
      .input('tableName', sql.NVarChar, candidate.name)
      .query(`
        SELECT TOP (1) t.name AS tableName, s.name AS schemaName
        FROM ${dbPrefix}sys.tables AS t
        INNER JOIN ${dbPrefix}sys.schemas AS s
          ON s.schema_id = t.schema_id
        WHERE s.name = @schemaName
          AND t.name = @tableName
      `);

    if (result.recordset.length > 0) {
      return candidate;
    }
  }

  return null;
}

function pickColumn(columns, candidates) {
  const normalizedColumns = new Map(
    columns.map((column) => [String(column).toUpperCase(), column]),
  );

  return candidates
    .map((candidate) => normalizedColumns.get(String(candidate).toUpperCase()))
    .find(Boolean) || null;
}

function buildAliasedColumn(columnName, alias) {
  return `${escapeIdentifier(columnName)} AS ${escapeIdentifier(alias)}`;
}

function buildTrimmedNVarCharExpression(expression) {
  return `LTRIM(RTRIM(COALESCE(CAST(${expression} AS NVARCHAR(4000)), '')))`;
}

function buildUpperTrimmedExpression(expression) {
  return `UPPER(${buildTrimmedNVarCharExpression(expression)})`;
}

function buildShortSeloExpression(expression) {
  const trimmedExpression = buildTrimmedNVarCharExpression(expression);

  return `UPPER(CASE
    WHEN CHARINDEX('-', ${trimmedExpression}) > 0
      THEN LTRIM(RTRIM(LEFT(${trimmedExpression}, CHARINDEX('-', ${trimmedExpression}) - 1)))
    ELSE ${trimmedExpression}
  END)`;
}

function buildSeloMatchCondition(leftExpression, rightExpression) {
  const leftFull = buildUpperTrimmedExpression(leftExpression);
  const rightFull = buildUpperTrimmedExpression(rightExpression);
  const leftShort = buildShortSeloExpression(leftExpression);
  const rightShort = buildShortSeloExpression(rightExpression);

  return `(
    ${leftFull} = ${rightFull}
    OR (${leftShort} <> '' AND ${rightShort} <> '' AND ${leftShort} = ${rightShort})
  )`;
}

function buildCoalescedColumnExpression(tableAlias, columns) {
  const expressions = columns
    .filter(Boolean)
    .map((columnName) => `${tableAlias}.${escapeIdentifier(columnName)}`);

  if (expressions.length === 0) {
    return 'NULL';
  }

  if (expressions.length === 1) {
    return expressions[0];
  }

  return `COALESCE(${expressions.join(', ')})`;
}

function buildLastDaysWindowCondition(dateExpression, daysExpression) {
  return `${dateExpression} >= DATEADD(day, -${daysExpression}, SYSUTCDATETIME())`;
}

function buildUtcTodayCondition(dateExpression) {
  return `CAST(${dateExpression} AS date) = CAST(SYSUTCDATETIME() AS date)`;
}

async function resolveRadioSeloColumn(pool) {
  const columns = await getColumnNames(pool, 'dbo', 'dimRadios');
  return pickColumn(columns, [
    'RadioSeloComplemento',
    'RadioSeloComplemeno',
    'NumeroSelo',
    'Selo',
  ]);
}

async function resolveRadioLookupColumns(pool) {
  const columns = await getColumnNames(pool, 'dbo', 'dimRadios');

  return {
    selo: pickColumn(columns, [
      'RadioSeloComplemento',
      'RadioSeloComplemeno',
      'NumeroSelo',
      'Selo',
    ]),
    setor: pickColumn(columns, [
      'Setor',
      'CodigoSetor',
      'SetorCodigo',
      'NumeroSetor',
      'RadioSetor',
      'CodSetor',
    ]),
    usuario: pickColumn(columns, [
      'Usuario',
      'UsuarioNome',
      'NomeUsuario',
      'RadioUsuario',
      'RadioUsuarioNome',
      'Responsavel',
      'NomeResponsavel',
      'Colaborador',
      'NomeColaborador',
      'Operador',
      'NomeOperador',
    ]),
    equipamento: pickColumn(columns, [
      'Equipamento',
      'RadioEquipamento',
      'RadioEquipamentoModelo',
      'Modelo',
      'RadioModelo',
      'Descricao',
    ]),
    situacao: pickColumn(columns, [
      'RadioSituacao',
      'Situacao',
      'Status',
      'RadioStatus',
    ]),
  };
}

async function resolveRadioConferenceHistoryColumns(pool) {
  const columns = await getColumnNames(pool, 'dbo', 'ConferenciaRadios');
  const createdAtColumns = [
    'DataRecebimentoServidor',
    'DataAtualizacaoApp',
    'DataCriacaoApp',
  ].filter((columnName) => columns.includes(columnName));

  return {
    selo: pickColumn(columns, ['NumeroSelo']),
    createdAt: createdAtColumns[0] || null,
    createdAtColumns,
    localId: pickColumn(columns, ['LocalId']),
    imagePath: pickColumn(columns, ['ImagePath']),
  };
}

async function resolveRadioReportColumns(pool) {
  const conferenceColumns = await getColumnNames(pool, 'dbo', 'ConferenciaRadios');
  const radioColumns = await getColumnNames(pool, 'dbo', 'dimRadios');

  const radioSeloColumn = pickColumn(radioColumns, [
    'RadioSeloComplemento',
    'RadioSeloComplemeno',
    'NumeroSelo',
    'Selo',
  ]);
  const conferenceSeloColumn = pickColumn(conferenceColumns, ['NumeroSelo']);
  const conferenceCreatedAtColumn = pickColumn(conferenceColumns, [
    'DataRecebimentoServidor',
    'DataAtualizacaoApp',
    'DataCriacaoApp',
  ]);
  const conferenceLocalIdColumn = pickColumn(conferenceColumns, ['LocalId']);

  if (!radioSeloColumn || !conferenceSeloColumn || !conferenceCreatedAtColumn) {
    throw new Error(
      'Nao foi possivel montar o relatorio de radios por falta de colunas obrigatorias.',
    );
  }

  return {
    conferenceColumns,
    radioColumns,
    radioSeloColumn,
    conferenceSeloColumn,
    conferenceCreatedAtColumn,
    conferenceLocalIdColumn,
  };
}

async function resolveRadioRegistrySchema(pool) {
  const dimRadios = (await getTableSchema(pool, 'dbo', 'dimRadios')).filter(
    (column) =>
      !column.isIdentity &&
      !column.isComputed &&
      !['timestamp', 'rowversion'].includes(String(column.dataType).toLowerCase()),
  );
  const fatoUsuariosRadios = await getTableSchema(pool, 'dbo', 'fatoUsuariosRadios');
  const primaryKey = await resolveRadioSeloColumn(pool);
  const ownerForeignKey = fatoUsuariosRadios.find(
    (column) => String(column.name).toUpperCase() === 'SELOCOMPLEMENTO',
  )?.name;

  if (!primaryKey) {
    throw new Error('Tabela dbo.dimRadios sem coluna de selo compativel.');
  }

  if (!ownerForeignKey) {
    throw new Error('Tabela dbo.fatoUsuariosRadios sem a coluna SeloComplemento.');
  }

  return {
    dimRadios,
    fatoUsuariosRadios,
    primaryKey,
    ownerForeignKey,
  };
}

function resolveRadioRegistryListColumns(columns) {
  const columnNames = columns.map((column) => column.name);

  return {
    modelo: pickColumn(columnNames, [
      'RadioEquipamentoModelo',
      'RadioModelo',
      'Modelo',
      'Equipamento',
      'RadioEquipamento',
      'Descricao',
    ]),
    setor: pickColumn(columnNames, [
      'RadioSetor',
      'Setor',
      'CodigoSetor',
      'SetorCodigo',
      'NumeroSetor',
      'CodSetor',
    ]),
    situacao: pickColumn(columnNames, [
      'RadioSituacao',
      'Situacao',
      'Status',
      'RadioStatus',
    ]),
    equipamento: pickColumn(columnNames, [
      'Equipamento',
      'RadioEquipamento',
      'RadioEquipamentoModelo',
      'Modelo',
      'RadioModelo',
      'Descricao',
    ]),
  };
}

async function listDistinctRadioRegistryValues(pool, columnName) {
  if (!columnName) {
    return [];
  }

  const result = await pool.request().query(`
    SELECT DISTINCT
      LTRIM(RTRIM(COALESCE(CAST(${escapeIdentifier(columnName)} AS NVARCHAR(4000)), ''))) AS value
    FROM dbo.dimRadios
    WHERE ${escapeIdentifier(columnName)} IS NOT NULL
      AND LTRIM(RTRIM(COALESCE(CAST(${escapeIdentifier(columnName)} AS NVARCHAR(4000)), ''))) <> ''
    ORDER BY value
  `);

  return result.recordset
    .map((row) => normalizeString(row.value))
    .filter(Boolean);
}

async function resolveRadioRegistryFieldOptions(pool, columns) {
  const listColumns = resolveRadioRegistryListColumns(columns);
  const fieldOptions = {};

  for (const columnName of [
    listColumns.setor,
    listColumns.situacao,
    listColumns.equipamento,
  ]) {
    if (!columnName || fieldOptions[columnName]) {
      continue;
    }

    fieldOptions[columnName] = await listDistinctRadioRegistryValues(pool, columnName);
  }

  return fieldOptions;
}

function stringifyRadioRegistryValue(value, dataType) {
  if (value === null || value === undefined) {
    return '';
  }

  if (dataType === 'int' || dataType === 'bigint' || dataType === 'smallint' || dataType === 'tinyint') {
    return String(Number(value));
  }

  if (
    dataType === 'float' ||
    dataType === 'decimal' ||
    dataType === 'numeric' ||
    dataType === 'real' ||
    dataType === 'money' ||
    dataType === 'smallmoney'
  ) {
    return String(value);
  }

  return String(value);
}

function coerceRadioRegistryValue(value, dataType) {
  const sanitized = normalizeString(value);

  if (!sanitized) {
    return null;
  }

  if (dataType === 'int' || dataType === 'bigint' || dataType === 'smallint' || dataType === 'tinyint') {
    const parsed = Number.parseInt(sanitized, 10);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Valor invalido para campo numerico inteiro: ${sanitized}.`);
    }

    return parsed;
  }

  if (
    dataType === 'float' ||
    dataType === 'decimal' ||
    dataType === 'numeric' ||
    dataType === 'real' ||
    dataType === 'money' ||
    dataType === 'smallmoney'
  ) {
    const parsed = Number(sanitized.replace(',', '.'));

    if (!Number.isFinite(parsed)) {
      throw new Error(`Valor invalido para campo numerico decimal: ${sanitized}.`);
    }

    return parsed;
  }

  return sanitized;
}

function getSqlTypeForRegistryColumn(dataType) {
  switch (String(dataType).toLowerCase()) {
    case 'int':
      return sql.Int;
    case 'bigint':
      return sql.BigInt;
    case 'smallint':
      return sql.SmallInt;
    case 'tinyint':
      return sql.TinyInt;
    case 'float':
      return sql.Float;
    case 'real':
      return sql.Real;
    case 'decimal':
    case 'numeric':
      return sql.Decimal(18, 6);
    case 'money':
    case 'smallmoney':
      return sql.Money;
    default:
      return sql.NVarChar;
  }
}

function buildJsonProjection(columns, tableAlias) {
  if (!columns.length) {
    return `'{}'`;
  }

  return columns
    .map(
      (columnName) =>
        `${tableAlias}.${escapeIdentifier(columnName)} AS ${escapeIdentifier(columnName)}`,
    )
    .join(', ');
}

function indexRadioConferenceImages() {
  const fallbackItems = readLocalFallback(localRadioFallbackPath);
  const imagesByLocalId = new Map();
  const imagesByNumeroSelo = new Map();

  fallbackItems.forEach((item) => {
    const localId = normalizeString(item?.localId);
    const numeroSelo = normalizeString(item?.numeroSelo).toUpperCase();
    const imagePaths = Array.isArray(item?.imagePaths)
      ? item.imagePaths.filter((imagePath) => normalizeString(imagePath))
      : [];

    if (localId && imagePaths.length > 0 && !imagesByLocalId.has(localId)) {
      imagesByLocalId.set(localId, imagePaths);
    }

    if (numeroSelo && imagePaths.length > 0 && !imagesByNumeroSelo.has(numeroSelo)) {
      imagesByNumeroSelo.set(numeroSelo, imagePaths);
    }
  });

  return { imagesByLocalId, imagesByNumeroSelo };
}

function resolveRadioImageFullPath(fileName) {
  const sanitizedFileName = path.basename(normalizeString(fileName));

  if (!sanitizedFileName) {
    return null;
  }

  const candidate = path.join(radioImagesDirectory, sanitizedFileName);

  if (fs.existsSync(candidate)) {
    return candidate;
  }

  const fallbackItems = readLocalFallback(localRadioFallbackPath);

  for (const item of fallbackItems) {
    const imagePaths = Array.isArray(item?.imagePaths) ? item.imagePaths : [];
    const matchedPath = imagePaths.find(
      (imagePath) => path.basename(normalizeString(imagePath)) === sanitizedFileName,
    );

    if (matchedPath && fs.existsSync(matchedPath)) {
      return matchedPath;
    }
  }

  return null;
}

async function resolveUserColumns(pool) {
  const columns = await getColumnNames(pool, 'dbo', 'Usuarios');
  const resolved = {
    matricula: pickColumn(columns, ['Matricula', 'UsuarioMatricula', 'MATRICULA']),
    senha: pickColumn(columns, ['Senha', 'UsuarioSenha', 'SENHA']),
    nome: pickColumn(columns, ['Nome', 'UsuarioNome', 'NOME']),
    setor: pickColumn(columns, ['Setor', 'CodigoSetor', 'SetorCodigo']),
    unidade: pickColumn(columns, ['Unidade', 'CodigoUnidade', 'UnidadeCodigo']),
    tipoUsuario: pickColumn(columns, ['TipoUsuario', 'Perfil', 'UsuarioTipo']),
  };

  if (!resolved.matricula || !resolved.senha || !resolved.nome || !resolved.setor) {
    throw new Error('Tabela dbo.Usuarios sem as colunas minimas esperadas para login.');
  }

  return resolved;
}

async function resolveInventoryProductSource(pool) {
  const table = await findExistingTable(pool, inventoryProductTableCandidates, almoxDatabaseName);

  if (!table) {
    return null;
  }

  const columns = await getColumnNames(pool, table.schema, table.name, almoxDatabaseName);
  const resolved = {
    table,
    columns,
    barcode: pickColumn(columns, [
      'ProdutoCodigoBarras',
      'CodigoBarras',
      'CodigoDeBarras',
      'CodBarras',
      'EAN',
    ]),
    description: pickColumn(columns, ['ProdutoDescricao', 'Descricao', 'NomeProduto']),
    code: pickColumn(columns, ['ProdutoCodigo', 'CodigoProduto', 'Codigo']),
    session: pickColumn(columns, ['ProdutoSessao', 'Sessao']),
    shelf: pickColumn(columns, ['ProdutoPrateleira', 'Prateleira']),
    board: pickColumn(columns, ['ProdutoTabua', 'Tabua']),
    item: pickColumn(columns, ['ProdutoItem', 'Item']),
    quantity: pickColumn(columns, ['ProdutoQuantidade', 'Quantidade', 'Saldo']),
    stockValue: pickColumn(columns, ['ProdutoValorEstoque', 'ValorEstoque', 'ValorSaldo']),
    lastSaleDate: pickColumn(columns, ['ProdutoDataUltimaVenda', 'DataUltimaVenda']),
    monthSaleQty: pickColumn(columns, ['ProdutoQTDE_VendaMes', 'QuantidadeVendaMes']),
    lastPurchaseDate: pickColumn(columns, ['ProdutoDataUltimaCompra', 'DataUltimaCompra']),
    lastPurchaseQty: pickColumn(columns, ['ProdutoQTDEUltimaCompra', 'QuantidadeUltimaCompra']),
    lastPurchaseValue: pickColumn(columns, ['ProdutoVLRUltimaCompra', 'ValorUltimaCompra']),
  };

  if (!resolved.barcode) {
    throw new Error('Base de produtos do Almox encontrada sem coluna de codigo de barras.');
  }

  return resolved;
}

async function resolveInventoryCountTarget(pool) {
  const table = await findExistingTable(pool, inventoryCountTableCandidates, almoxDatabaseName);

  if (!table) {
    return null;
  }

  const columns = await getColumnNames(pool, table.schema, table.name, almoxDatabaseName);
  return {
    table,
    localId: pickColumn(columns, ['LocalId']),
    codigoBarras: pickColumn(columns, ['CodigoBarras', 'ProdutoCodigoBarras']),
    codigoProduto: pickColumn(columns, ['CodigoProduto', 'ProdutoCodigo']),
    quantidadeFisica: pickColumn(columns, ['QuantidadeFisica', 'Quantidade']),
    observacao: pickColumn(columns, ['Observacao']),
    usuarioNome: pickColumn(columns, ['UsuarioNome', 'ContadoPor']),
    usuarioMatricula: pickColumn(columns, ['UsuarioMatricula', 'Matricula']),
    usuarioId: pickColumn(columns, ['UsuarioId']),
    dataCriacaoApp: pickColumn(columns, ['DataCriacaoApp', 'CreatedAt', 'DataContagem']),
    dataAtualizacaoApp: pickColumn(columns, ['DataAtualizacaoApp', 'UpdatedAt']),
    imagemPath: pickColumn(columns, ['ImagemPath', 'FotoPath', 'ArquivoImagem', 'FotoArquivo']),
  };
}

async function saveUploadedFiles(files, directoryPath) {
  ensureDirectory(directoryPath);

  return Promise.all(
    files.map(async (file) => {
      const extension = path.extname(file.originalname || '') || '.jpg';
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
      const fullPath = path.join(directoryPath, safeName);

      await fs.promises.writeFile(fullPath, file.buffer);

      return {
        fileName: safeName,
        fullPath,
      };
    }),
  );
}

function formatFileDate(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function sanitizeFileNamePart(value) {
  return normalizeString(value)
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
}

function getUploadFileExtension(file) {
  const sourceName = normalizeString(file?.originalname);

  if (sourceName.includes('.')) {
    const extension = sanitizeFileNamePart(sourceName.split('.').pop()).replace(/\./g, '');

    if (extension) {
      return extension.toLowerCase();
    }
  }

  const mimeType = normalizeString(file?.mimetype);

  if (mimeType.includes('/')) {
    const extension = sanitizeFileNamePart(mimeType.split('/').pop()).replace(/\./g, '');

    if (extension) {
      return extension.toLowerCase();
    }
  }

  return 'jpg';
}

function buildRadioImageBaseName(numeroSelo, date) {
  const safeNumeroSelo = sanitizeFileNamePart(numeroSelo) || 'radio';
  const datePart = formatFileDate(date);

  return `${safeNumeroSelo}-${datePart}`;
}

function buildRadioImageFileName(numeroSelo, date, sequence = 1, extension = 'jpg') {
  const baseName = buildRadioImageBaseName(numeroSelo, date);
  const sequenceSuffix = sequence > 1 ? `-${sequence}` : '';
  const safeExtension = sanitizeFileNamePart(extension).replace(/\./g, '') || 'jpg';

  return `${baseName}${sequenceSuffix}.${safeExtension}`;
}

function findAvailableRadioImageFileName(
  directoryPath,
  numeroSelo,
  date,
  preferredSequence,
  extension,
  reservedNames = new Set(),
) {
  let sequence = Math.max(preferredSequence, 1);

  while (true) {
    const fileName = buildRadioImageFileName(numeroSelo, date, sequence, extension);
    const normalizedKey = fileName.toLowerCase();
    const fullPath = path.join(directoryPath, fileName);

    if (!reservedNames.has(normalizedKey) && !fs.existsSync(fullPath)) {
      reservedNames.add(normalizedKey);
      return fileName;
    }

    sequence += 1;
  }
}

async function saveRadioConferenceImages(files, directoryPath, numeroSelo, options = {}) {
  ensureDirectory(directoryPath);

  const savedFiles = [];
  const serverDate =
    options.createdAt instanceof Date && !Number.isNaN(options.createdAt.getTime())
      ? options.createdAt
      : new Date();
  const reservedNames = new Set();

  for (const [index, file] of files.entries()) {
    const fileName = findAvailableRadioImageFileName(
      directoryPath,
      numeroSelo,
      serverDate,
      index + 1,
      getUploadFileExtension(file),
      reservedNames,
    );
    const fullPath = path.join(directoryPath, fileName);

    await fs.promises.writeFile(fullPath, file.buffer);

    savedFiles.push({
      fileName,
      fullPath,
    });
  }

  return savedFiles;
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use((request, response, next) => {
  const startedAt = Date.now();
  const query = Object.keys(request.query || {}).length
    ? ` query=${JSON.stringify(request.query)}`
    : '';

  log(
    'HTTP_IN',
    `${request.method} ${request.originalUrl}`,
    `ip=${request.ip}${query}`,
  );

  response.on('finish', () => {
    log(
      'HTTP_OUT',
      `${request.method} ${request.originalUrl}`,
      `status=${response.statusCode} durationMs=${Date.now() - startedAt}`,
    );
  });

  next();
});

app.get('/health', async (_request, response) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');

    response.json({
      ok: true,
      database: process.env.DB_NAME,
      server: process.env.DB_SERVER,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no health check.';
    log('HEALTH', 'Falha ao validar o banco', formatErrorDetail(error));
    response.status(503).send(message);
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const matricula = normalizeString(request.body?.matricula);
    const senha = normalizeString(request.body?.senha);

    if (!matricula || !senha) {
      response.status(400).send('Matricula e senha sao obrigatorias.');
      return;
    }

    const pool = await getPool();
    const userColumns = await resolveUserColumns(pool);
    const selectedColumns = [
      buildAliasedColumn(userColumns.matricula, 'matricula'),
      buildAliasedColumn(userColumns.nome, 'nome'),
      buildAliasedColumn(userColumns.setor, 'setor'),
    ];

    if (userColumns.unidade) {
      selectedColumns.push(buildAliasedColumn(userColumns.unidade, 'unidade'));
    }

    if (userColumns.tipoUsuario) {
      selectedColumns.push(buildAliasedColumn(userColumns.tipoUsuario, 'tipoUsuario'));
    }

    const result = await pool
      .request()
      .input('matricula', sql.NVarChar, matricula)
      .input('senha', sql.NVarChar, senha)
      .query(`
        SELECT TOP (1)
          ${selectedColumns.join(',\n          ')}
        FROM dbo.Usuarios
        WHERE ${escapeIdentifier(userColumns.matricula)} = @matricula
          AND ${escapeIdentifier(userColumns.senha)} = @senha
      `);

    if (result.recordset.length === 0) {
      response.status(401).send('Matricula ou senha invalidas.');
      return;
    }

    response.json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/radios/search', async (request, response, next) => {
  try {
    const query = normalizeString(request.query.query);

    if (!query) {
      response.json([]);
      return;
    }

    const pool = await getPool();
    const radioColumns = await resolveRadioLookupColumns(pool);
    const imageColumns = await resolveRadioConferenceHistoryColumns(pool);
    const seloColumnName = radioColumns.selo;
    const canIncludeLatestConference =
      imageColumns.selo && imageColumns.createdAtColumns.length > 0;
    const canIncludeImagePath =
      canIncludeLatestConference && imageColumns.imagePath;
    const latestConferenceDateExpression = buildCoalescedColumnExpression(
      'cr',
      imageColumns.createdAtColumns,
    );

    if (!seloColumnName) {
      throw new Error('Tabela dbo.dimRadios sem coluna de selo compativel.');
    }

    const selectedColumns = [
      `dr.${escapeIdentifier(seloColumnName)} AS ${escapeIdentifier('RadioSeloComplemento')}`,
    ];

    if (radioColumns.setor) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.setor)} AS ${escapeIdentifier('Setor')}`);
    }

    if (radioColumns.usuario) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.usuario)} AS ${escapeIdentifier('Usuario')}`);
    }

    if (radioColumns.equipamento) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.equipamento)} AS ${escapeIdentifier('Equipamento')}`);
    }

    if (radioColumns.situacao) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.situacao)} AS ${escapeIdentifier('RadioSituacao')}`);
    }

    if (canIncludeLatestConference) {
      selectedColumns.push(
        `latestConference.${escapeIdentifier('LastConferenceAt')} AS ${escapeIdentifier('LastConferenceAt')}`,
      );
      selectedColumns.push(
        `CASE
          WHEN ${buildLastDaysWindowCondition(
            `latestConference.${escapeIdentifier('LastConferenceAt')}`,
            '@statusWindowDays',
          )}
            THEN 'Conferido'
          ELSE 'Pendente'
        END AS ${escapeIdentifier('ConferenceStatus')}`,
      );
    } else {
      selectedColumns.push(`'Pendente' AS ${escapeIdentifier('ConferenceStatus')}`);
    }

    if (canIncludeImagePath) {
      selectedColumns.push(
        `latestConference.${escapeIdentifier(imageColumns.imagePath)} AS ${escapeIdentifier('ImagePath')}`,
      );
    }

    const result = await pool
      .request()
      .input('query', sql.NVarChar, query)
      .input('statusWindowDays', sql.Int, RADIO_CONFERENCE_STATUS_WINDOW_DAYS)
      .query(`
        SELECT TOP (20)
          ${selectedColumns.join(',\n          ')}
        FROM dbo.dimRadios AS dr
        ${
          canIncludeLatestConference
            ? `OUTER APPLY (
          SELECT TOP (1)
            ${latestConferenceDateExpression} AS ${escapeIdentifier('LastConferenceAt')}
            ${canIncludeImagePath ? `, cr.${escapeIdentifier(imageColumns.imagePath)}` : ''}
          FROM dbo.ConferenciaRadios AS cr
          WHERE ${buildSeloMatchCondition(
            `cr.${escapeIdentifier(imageColumns.selo)}`,
            `dr.${escapeIdentifier(seloColumnName)}`,
          )}
          ORDER BY ${latestConferenceDateExpression} DESC
        ) AS latestConference`
            : ''
        }
        WHERE dr.${escapeIdentifier(seloColumnName)} LIKE '%' + @query + '%'
          ${
            radioColumns.situacao
              ? `AND UPPER(${buildTrimmedNVarCharExpression(`dr.${escapeIdentifier(radioColumns.situacao)}`)}) = 'ATIVO'`
              : ''
          }
        ORDER BY dr.${escapeIdentifier(seloColumnName)}
      `);

    response.json(
      result.recordset.map((item) => ({
        ...item,
        ImagePath: normalizeNullableString(item.ImagePath),
        ImageUrl: buildRadioImageUrl(request, item.ImagePath),
        LastConferenceAt: item.LastConferenceAt || null,
        ConferenceStatus: item.ConferenceStatus || 'Pendente',
      })),
    );
  } catch (error) {
    next(error);
  }
});

app.get('/api/radios/catalog', async (request, response, next) => {
  try {
    const pool = await getPool();
    const radioColumns = await resolveRadioLookupColumns(pool);
    const imageColumns = await resolveRadioConferenceHistoryColumns(pool);
    const seloColumnName = radioColumns.selo;
    const canIncludeLatestConference =
      imageColumns.selo && imageColumns.createdAtColumns.length > 0;
    const canIncludeImagePath =
      canIncludeLatestConference && imageColumns.imagePath;
    const latestConferenceDateExpression = buildCoalescedColumnExpression(
      'cr',
      imageColumns.createdAtColumns,
    );

    if (!seloColumnName) {
      throw new Error('Tabela dbo.dimRadios sem coluna de selo compativel.');
    }

    const selectedColumns = [
      `dr.${escapeIdentifier(seloColumnName)} AS ${escapeIdentifier('RadioSeloComplemento')}`,
    ];

    if (radioColumns.setor) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.setor)} AS ${escapeIdentifier('Setor')}`);
    }

    if (radioColumns.usuario) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.usuario)} AS ${escapeIdentifier('Usuario')}`);
    }

    if (radioColumns.equipamento) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.equipamento)} AS ${escapeIdentifier('Equipamento')}`);
    }

    if (radioColumns.situacao) {
      selectedColumns.push(`dr.${escapeIdentifier(radioColumns.situacao)} AS ${escapeIdentifier('RadioSituacao')}`);
    }

    if (canIncludeLatestConference) {
      selectedColumns.push(
        `latestConference.${escapeIdentifier('LastConferenceAt')} AS ${escapeIdentifier('LastConferenceAt')}`,
      );
      selectedColumns.push(
        `CASE
          WHEN ${buildLastDaysWindowCondition(
            `latestConference.${escapeIdentifier('LastConferenceAt')}`,
            String(RADIO_CONFERENCE_STATUS_WINDOW_DAYS),
          )}
            THEN 'Conferido'
          ELSE 'Pendente'
        END AS ${escapeIdentifier('ConferenceStatus')}`,
      );
    } else {
      selectedColumns.push(`'Pendente' AS ${escapeIdentifier('ConferenceStatus')}`);
    }

    if (canIncludeImagePath) {
      selectedColumns.push(
        `latestConference.${escapeIdentifier(imageColumns.imagePath)} AS ${escapeIdentifier('ImagePath')}`,
      );
    }

    const result = await pool.request().query(`
      SELECT
        ${selectedColumns.join(',\n        ')}
      FROM dbo.dimRadios AS dr
      ${
        canIncludeLatestConference
          ? `OUTER APPLY (
        SELECT TOP (1)
          ${latestConferenceDateExpression} AS ${escapeIdentifier('LastConferenceAt')}
          ${canIncludeImagePath ? `, cr.${escapeIdentifier(imageColumns.imagePath)}` : ''}
        FROM dbo.ConferenciaRadios AS cr
        WHERE ${buildSeloMatchCondition(
          `cr.${escapeIdentifier(imageColumns.selo)}`,
          `dr.${escapeIdentifier(seloColumnName)}`,
        )}
        ORDER BY ${latestConferenceDateExpression} DESC
      ) AS latestConference`
          : ''
      }
      WHERE dr.${escapeIdentifier(seloColumnName)} IS NOT NULL
        AND LTRIM(RTRIM(dr.${escapeIdentifier(seloColumnName)})) <> ''
        ${
          radioColumns.situacao
            ? `AND UPPER(${buildTrimmedNVarCharExpression(`dr.${escapeIdentifier(radioColumns.situacao)}`)}) = 'ATIVO'`
            : ''
        }
      ORDER BY dr.${escapeIdentifier(seloColumnName)}
    `);

    response.json({
      items: result.recordset.map((item) => ({
        ...item,
        ImagePath: normalizeNullableString(item.ImagePath),
        ImageUrl: buildRadioImageUrl(request, item.ImagePath),
        LastConferenceAt: item.LastConferenceAt || null,
        ConferenceStatus: item.ConferenceStatus || 'Pendente',
      })),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/radios/list', async (request, response, next) => {
  try {
    const setor = normalizeString(request.query.setor);
    const selo = normalizeString(request.query.selo);
    const limit = Math.min(Math.max(Number(request.query.limit || 500), 1), 2000);
    const pool = await getPool();
    const radioColumns = await resolveRadioLookupColumns(pool);
    const historyColumns = await resolveRadioConferenceHistoryColumns(pool);
    const seloColumnName = radioColumns.selo;
    const canIncludeLatestConference =
      historyColumns.selo && historyColumns.createdAtColumns.length > 0;
    const canIncludeImagePath = canIncludeLatestConference && historyColumns.imagePath;
    const latestConferenceDateExpression = buildCoalescedColumnExpression(
      'cr',
      historyColumns.createdAtColumns,
    );

    if (!seloColumnName) {
      throw new Error('Tabela dbo.dimRadios sem coluna de selo compativel.');
    }

    if (setor && !radioColumns.setor) {
      throw new Error('Tabela dbo.dimRadios sem coluna RadioSetor compativel para filtro.');
    }

    const selectedColumns = [
      `dr.${escapeIdentifier(seloColumnName)} AS ${escapeIdentifier('RadioSeloComplemento')}`,
    ];
    const whereClauses = [
      `dr.${escapeIdentifier(seloColumnName)} IS NOT NULL`,
      `LTRIM(RTRIM(dr.${escapeIdentifier(seloColumnName)})) <> ''`,
    ];
    const requestBuilder = pool
      .request()
      .input('limit', sql.Int, limit)
      .input('statusWindowDays', sql.Int, RADIO_CONFERENCE_STATUS_WINDOW_DAYS);

    if (radioColumns.setor) {
      selectedColumns.push(
        `dr.${escapeIdentifier(radioColumns.setor)} AS ${escapeIdentifier('RadioSetor')}`,
      );
      selectedColumns.push(
        `dr.${escapeIdentifier(radioColumns.setor)} AS ${escapeIdentifier('Setor')}`,
      );
    }

    if (radioColumns.equipamento) {
      selectedColumns.push(
        `dr.${escapeIdentifier(radioColumns.equipamento)} AS ${escapeIdentifier('Equipamento')}`,
      );
    }

    if (radioColumns.situacao) {
      selectedColumns.push(
        `dr.${escapeIdentifier(radioColumns.situacao)} AS ${escapeIdentifier('RadioSituacao')}`,
      );
      whereClauses.push(
        `UPPER(${buildTrimmedNVarCharExpression(`dr.${escapeIdentifier(radioColumns.situacao)}`)}) = 'ATIVO'`,
      );
    }

    if (canIncludeLatestConference) {
      selectedColumns.push(
        `latestConference.${escapeIdentifier('LastConferenceAt')} AS ${escapeIdentifier('LastConferenceAt')}`,
      );
      selectedColumns.push(
        `CASE
          WHEN ${buildLastDaysWindowCondition(
            `latestConference.${escapeIdentifier('LastConferenceAt')}`,
            '@statusWindowDays',
          )}
            THEN 'Conferido'
          ELSE 'Pendente'
        END AS ${escapeIdentifier('ConferenceStatus')}`,
      );
    } else {
      selectedColumns.push(`'Pendente' AS ${escapeIdentifier('ConferenceStatus')}`);
    }

    if (canIncludeImagePath) {
      selectedColumns.push(
        `latestConference.${escapeIdentifier(historyColumns.imagePath)} AS ${escapeIdentifier('ImagePath')}`,
      );
    }

    if (setor) {
      requestBuilder.input('setor', sql.NVarChar, setor.toUpperCase());
      whereClauses.push(
        `UPPER(LTRIM(RTRIM(COALESCE(CAST(dr.${escapeIdentifier(radioColumns.setor)} AS NVARCHAR(4000)), '')))) LIKE '%' + @setor + '%'`,
      );
    }

    if (selo) {
      requestBuilder.input('selo', sql.NVarChar, selo.toUpperCase());
      whereClauses.push(
        `UPPER(LTRIM(RTRIM(COALESCE(CAST(dr.${escapeIdentifier(seloColumnName)} AS NVARCHAR(4000)), '')))) LIKE '%' + @selo + '%'`,
      );
    }

    const result = await requestBuilder.query(`
      SELECT TOP (@limit)
        ${selectedColumns.join(',\n        ')}
      FROM dbo.dimRadios AS dr
      ${
        canIncludeLatestConference
          ? `OUTER APPLY (
        SELECT TOP (1)
          ${latestConferenceDateExpression} AS ${escapeIdentifier('LastConferenceAt')}
          ${canIncludeImagePath ? `, cr.${escapeIdentifier(historyColumns.imagePath)}` : ''}
        FROM dbo.ConferenciaRadios AS cr
        WHERE ${buildSeloMatchCondition(
          `cr.${escapeIdentifier(historyColumns.selo)}`,
          `dr.${escapeIdentifier(seloColumnName)}`,
        )}
        ORDER BY ${latestConferenceDateExpression} DESC
      ) AS latestConference`
          : ''
      }
      WHERE ${whereClauses.join('\n        AND ')}
      ORDER BY
        CASE
          WHEN ${escapeIdentifier('ConferenceStatus')} = 'Pendente' THEN 0
          ELSE 1
        END,
        dr.${escapeIdentifier(seloColumnName)}
    `);

    response.json({
      items: result.recordset.map((item) => ({
        ...item,
        ImagePath: normalizeNullableString(item.ImagePath),
        ImageUrl: buildRadioImageUrl(request, item.ImagePath),
        LastConferenceAt: item.LastConferenceAt || null,
        ConferenceStatus: item.ConferenceStatus || 'Pendente',
      })),
      total: result.recordset.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/conferencias/radios/check', async (request, response, next) => {
  try {
    const numeroSelo = normalizeString(request.query.numeroSelo).toUpperCase();
    const days = Math.min(
      Math.max(Number(request.query.days || 1), 1),
      365,
    );

    if (!numeroSelo) {
      response.status(400).send('Numero do selo e obrigatorio.');
      return;
    }

    const pool = await getPool();
    const columns = await getColumnNames(pool, 'dbo', 'ConferenciaRadios');
    const seloColumnName = pickColumn(columns, ['NumeroSelo']);
    const serverDateColumnNames = [
      'DataRecebimentoServidor',
      'DataAtualizacaoApp',
      'DataCriacaoApp',
    ].filter((columnName) => columns.includes(columnName));
    const serverDateExpression =
      serverDateColumnNames.length > 1
        ? `COALESCE(${serverDateColumnNames.map((columnName) => escapeIdentifier(columnName)).join(', ')})`
        : serverDateColumnNames[0]
          ? escapeIdentifier(serverDateColumnNames[0])
          : null;

    if (!seloColumnName || !serverDateExpression) {
      throw new Error('Tabela dbo.ConferenciaRadios sem as colunas minimas para a validacao.');
    }

    const windowCondition = buildLastDaysWindowCondition(serverDateExpression, '@days');
    const todayCondition = buildUtcTodayCondition(serverDateExpression);
    const result = await pool
      .request()
      .input('numeroSelo', sql.NVarChar, numeroSelo)
      .input('days', sql.Int, days)
      .query(`
        SELECT
          MAX(CASE WHEN ${todayCondition} THEN 1 ELSE 0 END) AS ${escapeIdentifier('AlreadyCheckedToday')},
          MAX(CASE WHEN ${windowCondition} THEN 1 ELSE 0 END) AS ${escapeIdentifier('AlreadyCheckedInWindow')}
        FROM dbo.ConferenciaRadios
        WHERE ${buildSeloMatchCondition(escapeIdentifier(seloColumnName), '@numeroSelo')}
      `);
    const status = result.recordset[0] || {};

    response.json({
      alreadyCheckedToday: status.AlreadyCheckedToday === 1,
      alreadyCheckedInWindow: status.AlreadyCheckedInWindow === 1,
      days,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/radios/registry/schema', async (_request, response, next) => {
  try {
    const pool = await getPool();
    const schema = await resolveRadioRegistrySchema(pool);
    const fieldOptions = await resolveRadioRegistryFieldOptions(pool, schema.dimRadios);
    response.json({
      ...schema,
      fieldOptions,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/radios/registry', async (request, response, next) => {
  try {
    const query = normalizeString(request.query.query).toUpperCase();
    const pool = await getPool();
    const schema = await resolveRadioRegistrySchema(pool);
    const listColumns = resolveRadioRegistryListColumns(schema.dimRadios);
    const dataTypesByColumn = Object.fromEntries(
      schema.dimRadios.map((column) => [column.name, column.dataType]),
    );
    const selectedColumns = schema.dimRadios.map(
      (column) => `dr.${escapeIdentifier(column.name)} AS ${escapeIdentifier(column.name)}`,
    );
    const searchableColumns = Array.from(
      new Set(
        [
          schema.primaryKey,
          listColumns.modelo,
          listColumns.equipamento,
          listColumns.setor,
          listColumns.situacao,
        ].filter(Boolean),
      ),
    );
    const whereClause =
      query && searchableColumns.length > 0
        ? `
      WHERE ${searchableColumns
        .map(
          (columnName) =>
            `UPPER(LTRIM(RTRIM(COALESCE(CAST(dr.${escapeIdentifier(columnName)} AS NVARCHAR(4000)), '')))) LIKE '%' + @query + '%'`,
        )
        .join('\n         OR ')}
    `
        : '';

    const radiosRequest = pool.request();

    if (query) {
      radiosRequest.input('query', sql.NVarChar, query);
    }

    const radiosResult = await radiosRequest.query(`
      SELECT
        ${selectedColumns.join(',\n        ')}
      FROM dbo.dimRadios AS dr
      ${whereClause}
      ORDER BY dr.${escapeIdentifier(schema.primaryKey)}
    `);

    const ownersResult = await pool.request().query(`
      SELECT
        ${escapeIdentifier(schema.ownerForeignKey)} AS SeloComplemento,
        ${escapeIdentifier('MatriculaUsuario')} AS MatriculaUsuario,
        ${escapeIdentifier('NomeUsuario')} AS NomeUsuario
      FROM dbo.fatoUsuariosRadios
    `);

    const ownersMap = new Map();
    ownersResult.recordset.forEach((row) => {
      const selo = normalizeString(row.SeloComplemento).toUpperCase();

      if (!selo) {
        return;
      }

      if (!ownersMap.has(selo)) {
        ownersMap.set(selo, []);
      }

      ownersMap.get(selo).push({
        MatriculaUsuario: normalizeString(row.MatriculaUsuario),
        NomeUsuario: normalizeString(row.NomeUsuario),
      });
    });

    response.json(
      radiosResult.recordset.map((row) => {
        const selo = normalizeString(row[schema.primaryKey]);

        return {
          selo,
          modelo: stringifyRadioRegistryValue(
            listColumns.modelo ? row[listColumns.modelo] : null,
            listColumns.modelo ? dataTypesByColumn[listColumns.modelo] : 'nvarchar',
          ),
          setor: stringifyRadioRegistryValue(
            listColumns.setor ? row[listColumns.setor] : null,
            listColumns.setor ? dataTypesByColumn[listColumns.setor] : 'nvarchar',
          ),
          situacao: stringifyRadioRegistryValue(
            listColumns.situacao ? row[listColumns.situacao] : null,
            listColumns.situacao ? dataTypesByColumn[listColumns.situacao] : 'nvarchar',
          ),
          equipamento: stringifyRadioRegistryValue(
            listColumns.equipamento ? row[listColumns.equipamento] : null,
            listColumns.equipamento
              ? dataTypesByColumn[listColumns.equipamento]
              : 'nvarchar',
          ),
          owners: ownersMap.get(selo.toUpperCase()) || [],
        };
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.get('/api/radios/registry/:selo', async (request, response, next) => {
  try {
    const requestedSelo = normalizeString(request.params.selo).toUpperCase();

    if (!requestedSelo) {
      response.status(400).send('O selo do radio e obrigatorio.');
      return;
    }

    const pool = await getPool();
    const schema = await resolveRadioRegistrySchema(pool);
    const selectedColumns = schema.dimRadios.map(
      (column) => `dr.${escapeIdentifier(column.name)} AS ${escapeIdentifier(column.name)}`,
    );

    const radioResult = await pool
      .request()
      .input('selo', sql.NVarChar, requestedSelo)
      .query(`
        SELECT TOP (1)
          ${selectedColumns.join(',\n          ')}
        FROM dbo.dimRadios AS dr
        WHERE UPPER(LTRIM(RTRIM(dr.${escapeIdentifier(schema.primaryKey)}))) = @selo
      `);

    if (radioResult.recordset.length === 0) {
      response.status(404).send('Radio nao encontrado.');
      return;
    }

    const ownersResult = await pool
      .request()
      .input('selo', sql.NVarChar, requestedSelo)
      .query(`
        SELECT
          ${escapeIdentifier('MatriculaUsuario')} AS MatriculaUsuario,
          ${escapeIdentifier('NomeUsuario')} AS NomeUsuario
        FROM dbo.fatoUsuariosRadios
        WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.ownerForeignKey)}))) = @selo
        ORDER BY ${escapeIdentifier('NomeUsuario')}, ${escapeIdentifier('MatriculaUsuario')}
      `);

    const dimRadios = {};
    const record = radioResult.recordset[0];
    schema.dimRadios.forEach((column) => {
      dimRadios[column.name] = stringifyRadioRegistryValue(record[column.name], column.dataType);
    });

    response.json({
      dimRadios,
      owners: ownersResult.recordset.map((row) => ({
        MatriculaUsuario: normalizeString(row.MatriculaUsuario),
        NomeUsuario: normalizeString(row.NomeUsuario),
      })),
    });
  } catch (error) {
    next(error);
  }
});

async function persistRadioRegistry(request, response, next, options) {
  try {
    const pool = await getPool();
    const schema = await resolveRadioRegistrySchema(pool);
    const dimPayload = request.body?.dimRadios && typeof request.body.dimRadios === 'object'
      ? request.body.dimRadios
      : {};
    const ownersPayload = Array.isArray(request.body?.owners) ? request.body.owners : [];
    const dimValues = {};

    schema.dimRadios.forEach((column) => {
      dimValues[column.name] = coerceRadioRegistryValue(
        dimPayload[column.name],
        column.dataType,
      );
    });

    const nextSelo = normalizeString(dimValues[schema.primaryKey]).toUpperCase();

    if (!nextSelo) {
      response.status(400).send(`O campo ${schema.primaryKey} e obrigatorio.`);
      return;
    }

    const missingRequired = schema.dimRadios
      .filter((column) => !column.isNullable && dimValues[column.name] === null)
      .map((column) => column.name);

    if (missingRequired.length > 0) {
      response
        .status(400)
        .send(`Campos obrigatorios ausentes em dimRadios: ${missingRequired.join(', ')}.`);
      return;
    }

    const owners = ownersPayload
      .map((owner) => ({
        MatriculaUsuario: normalizeString(owner?.MatriculaUsuario),
        NomeUsuario: normalizeString(owner?.NomeUsuario),
      }))
      .filter((owner) => owner.MatriculaUsuario || owner.NomeUsuario);

    const duplicateCheckRequest = pool.request().input('selo', sql.NVarChar, nextSelo);
    const duplicateResult = await duplicateCheckRequest.query(`
      SELECT TOP (1) 1 AS existsFlag
      FROM dbo.dimRadios
      WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.primaryKey)}))) = @selo
    `);

    const currentSelo = options.currentSelo ? normalizeString(options.currentSelo).toUpperCase() : null;

    if ((!currentSelo || currentSelo !== nextSelo) && duplicateResult.recordset.length > 0) {
      response.status(409).send('Ja existe um radio cadastrado com este selo.');
      return;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      if (currentSelo) {
        const existsResult = await new sql.Request(transaction)
          .input('currentSelo', sql.NVarChar, currentSelo)
          .query(`
            SELECT TOP (1) 1 AS existsFlag
            FROM dbo.dimRadios
            WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.primaryKey)}))) = @currentSelo
          `);

        if (existsResult.recordset.length === 0) {
          response.status(404).send('Radio nao encontrado para atualizacao.');
          await transaction.rollback();
          return;
        }

        await new sql.Request(transaction)
          .input('currentSelo', sql.NVarChar, currentSelo)
          .query(`
            DELETE FROM dbo.fatoUsuariosRadios
            WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.ownerForeignKey)}))) = @currentSelo
          `);

        const updateColumns = schema.dimRadios.filter((column) => column.name !== schema.primaryKey);
        const updateRequest = new sql.Request(transaction).input(
          'currentSelo',
          sql.NVarChar,
          currentSelo,
        );

        updateRequest.input(
          'nextPrimaryKey',
          getSqlTypeForRegistryColumn(
            schema.dimRadios.find((column) => column.name === schema.primaryKey)?.dataType,
          ),
          dimValues[schema.primaryKey],
        );

        updateColumns.forEach((column, index) => {
          updateRequest.input(
            `u${index}`,
            getSqlTypeForRegistryColumn(column.dataType),
            dimValues[column.name],
          );
        });

        await updateRequest.query(`
          UPDATE dbo.dimRadios
          SET
            ${escapeIdentifier(schema.primaryKey)} = @nextPrimaryKey,
            ${updateColumns
              .map((column, index) => `${escapeIdentifier(column.name)} = @u${index}`)
              .join(',\n            ')}
          WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.primaryKey)}))) = @currentSelo
        `);
      } else {
        const insertRequest = new sql.Request(transaction);
        schema.dimRadios.forEach((column, index) => {
          insertRequest.input(
            `d${index}`,
            getSqlTypeForRegistryColumn(column.dataType),
            dimValues[column.name],
          );
        });

        await insertRequest.query(`
          INSERT INTO dbo.dimRadios (
            ${schema.dimRadios.map((column) => escapeIdentifier(column.name)).join(', ')}
          )
          VALUES (
            ${schema.dimRadios.map((_, index) => `@d${index}`).join(', ')}
          )
        `);
      }

      for (const owner of owners) {
        await new sql.Request(transaction)
          .input('selo', sql.NVarChar, nextSelo)
          .input('matricula', sql.NVarChar, owner.MatriculaUsuario || null)
          .input('nome', sql.NVarChar, owner.NomeUsuario || null)
          .query(`
            INSERT INTO dbo.fatoUsuariosRadios (
              ${escapeIdentifier(schema.ownerForeignKey)},
              ${escapeIdentifier('MatriculaUsuario')},
              ${escapeIdentifier('NomeUsuario')}
            )
            VALUES (
              @selo,
              @matricula,
              @nome
            )
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    response.status(currentSelo ? 200 : 201).json({
      ok: true,
      selo: nextSelo,
    });
  } catch (error) {
    next(error);
  }
}

app.post('/api/radios/registry', async (request, response, next) => {
  await persistRadioRegistry(request, response, next, {});
});

app.put('/api/radios/registry/:selo', async (request, response, next) => {
  await persistRadioRegistry(request, response, next, {
    currentSelo: request.params.selo,
  });
});

app.delete('/api/radios/registry/:selo', async (request, response, next) => {
  try {
    const requestedSelo = normalizeString(request.params.selo).toUpperCase();
    const password = normalizeString(request.body?.password);

    if (!requestedSelo) {
      response.status(400).send('O selo do radio e obrigatorio.');
      return;
    }

    if (!password) {
      response.status(400).send('A senha para exclusao e obrigatoria.');
      return;
    }

    if (password !== RADIO_REGISTRY_DELETE_PASSWORD) {
      response.status(403).send('Senha invalida para excluir o cadastro do radio.');
      return;
    }

    const pool = await getPool();
    const schema = await resolveRadioRegistrySchema(pool);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const existsResult = await new sql.Request(transaction)
        .input('selo', sql.NVarChar, requestedSelo)
        .query(`
          SELECT TOP (1) 1 AS existsFlag
          FROM dbo.dimRadios
          WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.primaryKey)}))) = @selo
        `);

      if (existsResult.recordset.length === 0) {
        response.status(404).send('Radio nao encontrado para exclusao.');
        await transaction.rollback();
        return;
      }

      await new sql.Request(transaction)
        .input('selo', sql.NVarChar, requestedSelo)
        .query(`
          DELETE FROM dbo.fatoUsuariosRadios
          WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.ownerForeignKey)}))) = @selo
        `);

      await new sql.Request(transaction)
        .input('selo', sql.NVarChar, requestedSelo)
        .query(`
          DELETE FROM dbo.dimRadios
          WHERE UPPER(LTRIM(RTRIM(${escapeIdentifier(schema.primaryKey)}))) = @selo
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    response.json({
      ok: true,
      selo: requestedSelo,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/relatorios/radios', async (request, response, next) => {
  try {
    const numeroSelo = normalizeString(request.query.numeroSelo).toUpperCase();
    const limit = Math.min(Math.max(Number(request.query.limit || 200), 1), 1000);
    const pool = await getPool();
    const reportColumns = await resolveRadioReportColumns(pool);
    const radioProjection = buildJsonProjection(reportColumns.radioColumns, 'dr');
    const conferenceProjection = buildJsonProjection(reportColumns.conferenceColumns, 'cr');
    const queryRequest = pool
      .request()
      .input('limit', sql.Int, limit)
      .input('numeroSelo', sql.NVarChar, numeroSelo || null);

    const result = await queryRequest.query(`
      WITH UltimaConferencia AS (
        SELECT
          cr.*,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(cr.${escapeIdentifier(reportColumns.conferenceSeloColumn)})))
            ORDER BY cr.${escapeIdentifier(reportColumns.conferenceCreatedAtColumn)} DESC
          ) AS rn
        FROM dbo.ConferenciaRadios AS cr
        WHERE cr.${escapeIdentifier(reportColumns.conferenceSeloColumn)} IS NOT NULL
          AND LTRIM(RTRIM(cr.${escapeIdentifier(reportColumns.conferenceSeloColumn)})) <> ''
      )
      SELECT TOP (@limit)
        dr.${escapeIdentifier(reportColumns.radioSeloColumn)} AS numeroSelo,
        JSON_QUERY((
          SELECT ${radioProjection}
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )) AS dimRadios,
        JSON_QUERY((
          SELECT ${conferenceProjection}
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )) AS conferenciaRadios
      FROM dbo.dimRadios AS dr
      LEFT JOIN UltimaConferencia AS cr
        ON UPPER(LTRIM(RTRIM(dr.${escapeIdentifier(reportColumns.radioSeloColumn)}))) =
           UPPER(LTRIM(RTRIM(cr.${escapeIdentifier(reportColumns.conferenceSeloColumn)})))
       AND cr.rn = 1
      WHERE (@numeroSelo IS NULL OR UPPER(LTRIM(RTRIM(dr.${escapeIdentifier(reportColumns.radioSeloColumn)}))) = @numeroSelo)
      ORDER BY dr.${escapeIdentifier(reportColumns.radioSeloColumn)}
    `);

    const { imagesByLocalId, imagesByNumeroSelo } = indexRadioConferenceImages();
    const items = result.recordset.map((row) => {
      const dimRadios = row.dimRadios ? JSON.parse(row.dimRadios) : null;
      const conferenciaRadios = row.conferenciaRadios
        ? JSON.parse(row.conferenciaRadios)
        : null;
      const localId = normalizeString(conferenciaRadios?.LocalId);
      const numeroSeloConferencia = normalizeString(
        conferenciaRadios?.NumeroSelo || row.numeroSelo,
      ).toUpperCase();
      const imagePath = normalizeString(conferenciaRadios?.ImagePath);
      const fotosUltimaConferencia =
        imagePath
          ? [imagePath]
          : (localId && imagesByLocalId.get(localId)) ||
            (numeroSeloConferencia && imagesByNumeroSelo.get(numeroSeloConferencia)) ||
            [];

      return {
        numeroSelo: normalizeString(row.numeroSelo),
        dimRadios,
        conferenciaRadios,
        fotosUltimaConferencia: fotosUltimaConferencia
          .map((photoPath) => buildRadioImageUrl(request, photoPath))
          .filter(Boolean),
      };
    });

    response.json({
      items,
      total: items.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/radio-images/:fileName', async (request, response) => {
  const fullPath = resolveRadioImageFullPath(request.params.fileName);

  if (!fullPath) {
    response.status(404).send('Imagem nao encontrada.');
    return;
  }

  response.sendFile(fullPath);
});

app.post(
  '/api/conferencias/radios',
  upload.array('images', 10),
  async (request, response, next) => {
    try {
      const body = request.body || {};
      const files = Array.isArray(request.files) ? request.files : [];
      const payload = {
        localId: normalizeString(body.localId),
        numeroSelo: normalizeString(body.numeroSelo).toUpperCase(),
        usuarioNome: normalizeString(body.usuarioNome),
        equipamentoOperante: normalizeString(body.equipamentoOperante),
        botaoFunciona: normalizeString(body.botaoFunciona),
        bateriaEncaixa: normalizeString(body.bateriaEncaixa),
        existemRachaduras: normalizeString(body.existemRachaduras),
        riscosProfundos: normalizeString(body.riscosProfundos),
        capaProtetora: normalizeString(body.capaProtetora),
        alcaTransporte: normalizeString(body.alcaTransporte),
        identificacaoIntegra: normalizeString(body.identificacaoIntegra),
        equipamentoLimpo: normalizeString(body.equipamentoLimpo),
        situacaoGeral: normalizeString(body.situacaoGeral),
        observacao: normalizeString(body.observacao),
        createdAt: toDateOrNow(body.createdAt),
        updatedAt: toDateOrNow(body.updatedAt),
      };

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
      ];

      const missingFields = requiredFields.filter((field) => !payload[field]);

      if (missingFields.length > 0) {
        response
          .status(400)
          .send(`Campos obrigatorios ausentes: ${missingFields.join(', ')}.`);
        return;
      }

      const pool = await getPool();
      const columns = await getColumnNames(pool, 'dbo', 'ConferenciaRadios');

      if (columns.includes('LocalId')) {
        const existingConference = await pool
          .request()
          .input('localId', sql.NVarChar, payload.localId)
          .query(`
            SELECT TOP (1) 1 AS found
            FROM dbo.ConferenciaRadios
            WHERE ${escapeIdentifier('LocalId')} = @localId
          `);

        if (existingConference.recordset.length > 0) {
          response.status(200).json({
            ok: true,
            alreadySynced: true,
            uploadedImages: 0,
          });
          return;
        }
      }

      const savedFiles = await saveRadioConferenceImages(
        files,
        radioImagesDirectory,
        payload.numeroSelo,
        {
          createdAt: payload.createdAt,
        },
      );
      const imagePath = savedFiles[0]?.fileName || null;
      const imageNames = savedFiles.map((file) => file.fileName);

      if (imagePath && !columns.includes('ImagePath')) {
        throw new Error('Tabela dbo.ConferenciaRadios sem a coluna ImagePath para gravar o nome da foto.');
      }

      const insertableColumns = [
        ['LocalId', payload.localId, sql.NVarChar],
        ['NumeroSelo', payload.numeroSelo, sql.NVarChar],
        ['UsuarioNome', payload.usuarioNome, sql.NVarChar],
        ['EquipamentoOperante', payload.equipamentoOperante, sql.NVarChar],
        ['BotaoFunciona', payload.botaoFunciona, sql.NVarChar],
        ['BateriaEncaixa', payload.bateriaEncaixa, sql.NVarChar],
        ['ExistemRachaduras', payload.existemRachaduras, sql.NVarChar],
        ['RiscosProfundos', payload.riscosProfundos, sql.NVarChar],
        ['CapaProtetora', payload.capaProtetora, sql.NVarChar],
        ['AlcaTransporte', payload.alcaTransporte, sql.NVarChar],
        ['IdentificacaoIntegra', payload.identificacaoIntegra, sql.NVarChar],
        ['EquipamentoLimpo', payload.equipamentoLimpo, sql.NVarChar],
        ['SituacaoGeral', payload.situacaoGeral, sql.NVarChar],
        ['Observacao', payload.observacao, sql.NVarChar],
        ['ImagePath', imagePath, sql.NVarChar],
        ['ImagePaths', JSON.stringify(imageNames), sql.NVarChar],
        ['ImageNames', JSON.stringify(imageNames), sql.NVarChar],
        ['QuantidadeImagens', savedFiles.length, sql.Int],
        ['DataRecebimentoServidor', new Date(), sql.DateTime2],
        ['DataCriacaoApp', payload.createdAt, sql.DateTime2],
        ['DataAtualizacaoApp', payload.updatedAt, sql.DateTime2],
      ].filter(([columnName]) => columns.includes(columnName));

      if (insertableColumns.length === 0) {
        throw new Error('Tabela dbo.ConferenciaRadios indisponivel para gravacao.');
      }

      const requestBuilder = pool.request();
      insertableColumns.forEach(([columnName, value, type], index) => {
        requestBuilder.input(`p${index}`, type, value);
      });

      await requestBuilder.query(`
        INSERT INTO dbo.ConferenciaRadios (
          ${insertableColumns.map(([columnName]) => escapeIdentifier(columnName)).join(', ')}
        )
        VALUES (
          ${insertableColumns.map((_, index) => `@p${index}`).join(', ')}
        )
      `);

      upsertLocalFallback(localRadioFallbackPath, {
        ...payload,
        imagePaths: savedFiles.map((file) => file.fullPath),
        imageNames,
        imagePath,
        receivedAt: new Date().toISOString(),
      }, 'localId');

      response.status(201).json({
        ok: true,
        uploadedImages: savedFiles.length,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get('/api/almox/produtos/by-barcode/:codigoBarras', async (request, response, next) => {
  try {
    const codigoBarras = normalizeString(request.params.codigoBarras).replace(/\s/g, '');

    if (!codigoBarras) {
      response.status(400).send('Codigo de barras e obrigatorio.');
      return;
    }

    const pool = await getPool();
    const source = await resolveInventoryProductSource(pool);

    if (!source) {
      response.status(404).send('Base de produtos do Almox nao foi encontrada.');
      return;
    }

    const selectedColumns = [
      buildAliasedColumn(source.barcode, 'ProdutoCodigoBarras'),
      source.description && buildAliasedColumn(source.description, 'ProdutoDescricao'),
      source.code && buildAliasedColumn(source.code, 'ProdutoCodigo'),
      source.session && buildAliasedColumn(source.session, 'ProdutoSessao'),
      source.shelf && buildAliasedColumn(source.shelf, 'ProdutoPrateleira'),
      source.board && buildAliasedColumn(source.board, 'ProdutoTabua'),
      source.item && buildAliasedColumn(source.item, 'ProdutoItem'),
      source.quantity && buildAliasedColumn(source.quantity, 'ProdutoQuantidade'),
      source.stockValue && buildAliasedColumn(source.stockValue, 'ProdutoValorEstoque'),
      source.lastSaleDate && buildAliasedColumn(source.lastSaleDate, 'ProdutoDataUltimaVenda'),
      source.monthSaleQty && buildAliasedColumn(source.monthSaleQty, 'ProdutoQTDE_VendaMes'),
      source.lastPurchaseDate &&
        buildAliasedColumn(source.lastPurchaseDate, 'ProdutoDataUltimaCompra'),
      source.lastPurchaseQty &&
        buildAliasedColumn(source.lastPurchaseQty, 'ProdutoQTDEUltimaCompra'),
      source.lastPurchaseValue &&
        buildAliasedColumn(source.lastPurchaseValue, 'ProdutoVLRUltimaCompra'),
    ].filter(Boolean);

    const tableName = qualifyTableName(source.table.schema, source.table.name, almoxDatabaseName);
    const result = await pool
      .request()
      .input('codigoBarras', sql.NVarChar, codigoBarras)
      .query(`
        SELECT TOP (1)
          ${selectedColumns.join(',\n          ')}
        FROM ${tableName}
        WHERE REPLACE(LTRIM(RTRIM(${escapeIdentifier(source.barcode)})), ' ', '') = @codigoBarras
           OR REPLACE(LTRIM(RTRIM(${escapeIdentifier(source.barcode)})), ' ', '') = RIGHT(REPLICATE('0', 13) + @codigoBarras, 13)
      `);

    if (result.recordset.length === 0) {
      response.status(404).send('Produto nao encontrado para o codigo informado.');
      return;
    }

    response.json(result.recordset[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/almox/produtos/catalog', async (_request, response, next) => {
  try {
    const pool = await getPool();
    const source = await resolveInventoryProductSource(pool);

    if (!source) {
      response.status(404).send('Base de produtos do Almox nao foi encontrada.');
      return;
    }

    const selectedColumns = [
      buildAliasedColumn(source.barcode, 'ProdutoCodigoBarras'),
      source.description && buildAliasedColumn(source.description, 'ProdutoDescricao'),
      source.code && buildAliasedColumn(source.code, 'ProdutoCodigo'),
      source.session && buildAliasedColumn(source.session, 'ProdutoSessao'),
      source.shelf && buildAliasedColumn(source.shelf, 'ProdutoPrateleira'),
      source.board && buildAliasedColumn(source.board, 'ProdutoTabua'),
      source.item && buildAliasedColumn(source.item, 'ProdutoItem'),
      source.quantity && buildAliasedColumn(source.quantity, 'ProdutoQuantidade'),
      source.stockValue && buildAliasedColumn(source.stockValue, 'ProdutoValorEstoque'),
      source.lastSaleDate && buildAliasedColumn(source.lastSaleDate, 'ProdutoDataUltimaVenda'),
      source.monthSaleQty && buildAliasedColumn(source.monthSaleQty, 'ProdutoQTDE_VendaMes'),
      source.lastPurchaseDate &&
        buildAliasedColumn(source.lastPurchaseDate, 'ProdutoDataUltimaCompra'),
      source.lastPurchaseQty &&
        buildAliasedColumn(source.lastPurchaseQty, 'ProdutoQTDEUltimaCompra'),
      source.lastPurchaseValue &&
        buildAliasedColumn(source.lastPurchaseValue, 'ProdutoVLRUltimaCompra'),
    ].filter(Boolean);

    const tableName = qualifyTableName(source.table.schema, source.table.name, almoxDatabaseName);
    const result = await pool.request().query(`
      SELECT
        ${selectedColumns.join(',\n        ')}
      FROM ${tableName}
      WHERE ${escapeIdentifier(source.barcode)} IS NOT NULL
        AND LTRIM(RTRIM(${escapeIdentifier(source.barcode)})) <> ''
    `);

    response.json({
      items: result.recordset,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/almox/contagens', upload.single('foto'), async (request, response, next) => {
  try {
    const body = request.body || {};
    const payload = {
      localId: normalizeString(body.localId),
      codigoBarras: normalizeString(body.codigoBarras),
      codigoProduto: normalizeString(body.codigoProduto),
      quantidadeFisica: normalizeString(body.quantidadeFisica),
      observacao: normalizeString(body.observacao),
      usuarioNome: normalizeString(body.usuarioNome),
      usuarioMatricula: normalizeString(body.usuarioMatricula),
      createdAt: toDateOrNow(body.createdAt),
      updatedAt: toDateOrNow(body.updatedAt),
    };

    const requiredFields = [
      'localId',
      'codigoBarras',
      'codigoProduto',
      'quantidadeFisica',
      'usuarioNome',
      'usuarioMatricula',
    ];

    const missingFields = requiredFields.filter((field) => !payload[field]);

    if (missingFields.length > 0) {
      response
        .status(400)
        .send(`Campos obrigatorios ausentes: ${missingFields.join(', ')}.`);
      return;
    }

    const savedImage = request.file
      ? (await saveUploadedFiles([request.file], almoxImagesDirectory))[0]
      : null;

    const pool = await getPool();
    const target = await resolveInventoryCountTarget(pool);

    if (!target) {
      throw new Error('Tabela de contagem do Almox nao encontrada para gravacao.');
    }

    const insertableColumns = [
      [target.localId, payload.localId, sql.NVarChar],
      [target.codigoBarras, payload.codigoBarras, sql.NVarChar],
      [target.codigoProduto, payload.codigoProduto, sql.NVarChar],
      [target.quantidadeFisica, Number(payload.quantidadeFisica), sql.Decimal(18, 3)],
      [target.observacao, payload.observacao, sql.NVarChar],
      [target.usuarioNome, payload.usuarioNome, sql.NVarChar],
      [target.usuarioMatricula, payload.usuarioMatricula, sql.NVarChar],
      [target.usuarioId, null, sql.Int],
      [target.dataCriacaoApp, payload.createdAt, sql.DateTime2],
      [target.dataAtualizacaoApp, payload.updatedAt, sql.DateTime2],
      [target.imagemPath, savedImage?.fullPath || null, sql.NVarChar],
    ].filter(([columnName]) => Boolean(columnName));

    const requestBuilder = pool.request();
    insertableColumns.forEach(([_, value, type], index) => {
      requestBuilder.input(`p${index}`, type, value);
    });

    await requestBuilder.query(`
      INSERT INTO ${qualifyTableName(target.table.schema, target.table.name, almoxDatabaseName)} (
        ${insertableColumns.map(([columnName]) => escapeIdentifier(columnName)).join(', ')}
      )
      VALUES (
        ${insertableColumns.map((_, index) => `@p${index}`).join(', ')}
      )
    `);

    appendLocalFallback(localInventoryFallbackPath, {
      ...payload,
      imagePath: savedImage?.fullPath || null,
      receivedAt: new Date().toISOString(),
    });

    response.status(201).json({
      ok: true,
      storedInDatabase: Boolean(target),
      imageUploaded: Boolean(savedImage),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/pcp/medicoes-estoque', async (request, response, next) => {
  try {
    const body = request.body || {};
    const localId = normalizeString(body.localId);
    const idMedicao = normalizeString(body.id_medicao);
    const dataMedicao = normalizeString(body.data_medicao);
    const usuarioMedicao = normalizeString(body.usuario_medicao);
    const usuarioMatricula = normalizeString(body.usuario_matricula);
    const nomeAfericao = normalizeString(body.nome_afericao);
    const nomeArmazem = normalizeString(body.nome_armazem);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const stockMeasurementTableSql = `dbo.${escapeIdentifier(stockMeasurementTableName)}`;

    if (!localId || !idMedicao || !dataMedicao || !usuarioMedicao || !nomeAfericao || !nomeArmazem) {
      response
        .status(400)
        .send('Campos obrigatorios ausentes: localId, id_medicao, data_medicao, usuario_medicao, nome_afericao, nome_armazem.');
      return;
    }

    if (rows.length === 0) {
      response.status(400).send('A medicao precisa ter ao menos uma linha.');
      return;
    }

    const normalizedRows = rows.map((row) => ({
      id_medicao: normalizeString(row?.id_medicao || idMedicao),
      data_medicao: normalizeString(row?.data_medicao || dataMedicao),
      usuario_medicao: normalizeString(row?.usuario_medicao || usuarioMedicao),
      nome_afericao: normalizeString(row?.nome_afericao || nomeAfericao),
      nome_armazem: normalizeString(row?.nome_armazem || nomeArmazem),
      lado_medicao: normalizeString(row?.lado_medicao).toUpperCase(),
      arco: Number(row?.arco || 0),
      angulo_graus: normalizeString(row?.angulo_graus),
      medida_metros: normalizeString(row?.medida_metros),
    }));

    const invalidRow = normalizedRows.find(
      (row) =>
        !row.id_medicao ||
        !row.data_medicao ||
        !row.usuario_medicao ||
        !row.nome_afericao ||
        !row.nome_armazem ||
        !row.lado_medicao ||
        !row.arco ||
        !row.angulo_graus,
    );

    if (invalidRow) {
      response.status(400).send('Existem linhas de medicao com campos obrigatorios ausentes.');
      return;
    }

    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await new sql.Request(transaction)
        .input('id_medicao', sql.NVarChar(50), idMedicao)
        .query(`
          DELETE FROM ${stockMeasurementTableSql}
          WHERE [id_medicao] = @id_medicao
        `);

      for (const row of normalizedRows) {
        const parsedDate = parseDateOnly(row.data_medicao);
        const parsedAngle = toFloatOrNull(row.angulo_graus);
        const hasMeasureValue = row.medida_metros.length > 0;
        const parsedMeasure = hasMeasureValue ? toFloatOrNull(row.medida_metros) : null;

        if (!parsedDate || parsedAngle === null || (hasMeasureValue && parsedMeasure === null)) {
          throw new Error(
            'As linhas de medicao precisam ter data valida, valor numerico em angulo_graus e medida_metros numerica quando informada.',
          );
        }

        await new sql.Request(transaction)
          .input('id_medicao', sql.NVarChar(50), row.id_medicao)
          .input('data_medicao', sql.Date, parsedDate)
          .input('usuario_medicao', sql.NVarChar(200), row.usuario_medicao)
          .input('nome_afericao', sql.VarChar(100), row.nome_afericao)
          .input('nome_armazem', sql.VarChar(100), row.nome_armazem)
          .input('lado_medicao', sql.NVarChar(16), row.lado_medicao)
          .input('arco', sql.Int, row.arco)
          .input('angulo_graus', sql.Float, parsedAngle)
          .input('medida_metros', sql.Float, parsedMeasure)
          .query(`
            INSERT INTO ${stockMeasurementTableSql} (
              [id_medicao],
              [data_medicao],
              [usuario_medicao],
              [nome_afericao],
              [nome_armazem],
              [lado_medicao],
              [arco],
              [angulo_graus],
              [medida_metros]
            )
            VALUES (
              @id_medicao,
              @data_medicao,
              @usuario_medicao,
              @nome_afericao,
              @nome_armazem,
              @lado_medicao,
              @arco,
              @angulo_graus,
              @medida_metros
            )
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    removeLocalFallbackItems(
      localStockMeasurementFallbackPath,
      (item) => normalizeString(item?.id_medicao) === idMedicao,
    );
    [...normalizedRows].reverse().forEach((row) => {
      appendLocalFallback(localStockMeasurementFallbackPath, row);
    });

    response.status(201).json({
      ok: true,
      rows: normalizedRows.length,
      id_medicao: idMedicao,
      nome_afericao: nomeAfericao,
      nome_armazem: nomeArmazem,
      usuario_matricula: usuarioMatricula,
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/pcp/medicoes-estoque/:idMedicao', async (request, response, next) => {
  try {
    const idMedicao = normalizeString(request.params.idMedicao);
    const stockMeasurementTableSql = `dbo.${escapeIdentifier(stockMeasurementTableName)}`;

    if (!idMedicao) {
      response.status(400).send('O id_medicao e obrigatorio para excluir a medicao.');
      return;
    }

    const pool = await getPool();
    await pool
      .request()
      .input('id_medicao', sql.NVarChar(50), idMedicao)
      .query(`
        DELETE FROM ${stockMeasurementTableSql}
        WHERE [id_medicao] = @id_medicao
      `);

    removeLocalFallbackItems(
      localStockMeasurementFallbackPath,
      (item) => normalizeString(item?.id_medicao) === idMedicao,
    );

    response.json({
      ok: true,
      id_medicao: idMedicao,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const message = error instanceof Error ? error.message : 'Falha desconhecida do servidor.';
  log('HTTP_ERROR', 'Erro nao tratado na API', formatErrorDetail(error));
  response.status(500).send(message);
});

app.listen(port, '0.0.0.0', () => {
  ensureDirectory(localDataDirectory);
  ensureDirectory(radioImagesDirectory);
  ensureDirectory(almoxImagesDirectory);

  log(
    'BOOT',
    'API de sincronizacao rodando',
    `${process.env.EXPO_PUBLIC_API_URL || `http://localhost:${port}`} -> ${process.env.DB_SERVER}/${process.env.DB_NAME}`,
  );
});
