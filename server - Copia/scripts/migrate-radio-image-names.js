require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getPool, sql } = require('../db');

const localRadioFallbackPath = path.join(__dirname, '..', 'data', 'radio-conferences.json');

function normalizeString(value) {
  return String(value ?? '').trim();
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
const legacyLocalRadioImagesDirectory = path.win32.join(
  path.parse(process.cwd()).root,
  radioImagesDirectory.replace(/^[\\]+/, ''),
);

function sanitizeFileNamePart(value) {
  return normalizeString(value)
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
}

function formatFileDate(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildRadioImageBaseName(numeroSelo, date) {
  const safeNumeroSelo = sanitizeFileNamePart(numeroSelo) || 'radio';
  return `${safeNumeroSelo}-${formatFileDate(date)}`;
}

function buildRadioImageFileName(baseName, sequence, extension) {
  const safeExtension = sanitizeFileNamePart(extension).replace(/\./g, '') || 'jpg';
  const sequenceSuffix = sequence > 1 ? `-${sequence}` : '';
  return `${baseName}${sequenceSuffix}.${safeExtension}`;
}

function parseJsonArrayField(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  const sanitized = normalizeString(value);

  if (!sanitized) {
    return [];
  }

  try {
    const parsed = JSON.parse(sanitized);
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeString(item)).filter(Boolean)
      : [];
  } catch {
    return [sanitized];
  }
}

function uniqueBasenames(values) {
  const seen = new Set();
  const items = [];

  values.forEach((value) => {
    const baseName = path.basename(normalizeString(value));
    const key = baseName.toLowerCase();

    if (!baseName || seen.has(key)) {
      return;
    }

    seen.add(key);
    items.push(baseName);
  });

  return items;
}

function getLegacySourceAliases(fileName) {
  const baseName = path.basename(normalizeString(fileName));

  if (!baseName) {
    return [];
  }

  const aliases = [baseName];
  const prefixedMatch = baseName.match(/^\d{13}-(.+)$/);

  if (prefixedMatch?.[1]) {
    aliases.push(prefixedMatch[1]);
  }

  return uniqueBasenames(aliases);
}

function getRecordImageNames(record) {
  return uniqueBasenames([
    ...parseJsonArrayField(record.ImageNames),
    ...parseJsonArrayField(record.ImagePaths),
    normalizeString(record.ImagePath),
  ]);
}

function readLocalFallback() {
  if (!fs.existsSync(localRadioFallbackPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(localRadioFallbackPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalFallback(items) {
  fs.writeFileSync(localRadioFallbackPath, JSON.stringify(items, null, 2));
}

async function moveFile(sourcePath, targetPath) {
  try {
    await fs.promises.rename(sourcePath, targetPath);
  } catch (error) {
    if (error && error.code === 'EXDEV') {
      await fs.promises.copyFile(sourcePath, targetPath);
      await fs.promises.unlink(sourcePath);
      return;
    }

    throw error;
  }
}

function toValidDate(...values) {
  for (const value of values) {
    const parsed = new Date(String(value || ''));

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

async function getColumnNames(pool, schemaName, tableName) {
  const result = await pool.request().query(`
    SELECT c.name
    FROM sys.columns AS c
    WHERE c.object_id = OBJECT_ID(N'[${schemaName}].[${tableName}]')
  `);

  return result.recordset.map((row) => row.name);
}

function buildSourcePathMap(fallbackItems) {
  const sourcePaths = new Map();

  if (fs.existsSync(radioImagesDirectory)) {
    fs.readdirSync(radioImagesDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .forEach((entry) => {
        const fullPath = path.join(radioImagesDirectory, entry.name);

        getLegacySourceAliases(entry.name).forEach((alias) => {
          const key = alias.toLowerCase();

          if (!sourcePaths.has(key)) {
            sourcePaths.set(key, fullPath);
          }
        });
      });
  }

  if (
    legacyLocalRadioImagesDirectory &&
    legacyLocalRadioImagesDirectory.toLowerCase() !== radioImagesDirectory.toLowerCase() &&
    fs.existsSync(legacyLocalRadioImagesDirectory)
  ) {
    fs.readdirSync(legacyLocalRadioImagesDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .forEach((entry) => {
        const fullPath = path.join(legacyLocalRadioImagesDirectory, entry.name);

        getLegacySourceAliases(entry.name).forEach((alias) => {
          const key = alias.toLowerCase();

          if (!sourcePaths.has(key)) {
            sourcePaths.set(key, fullPath);
          }
        });
      });
  }

  fallbackItems.forEach((item) => {
    parseJsonArrayField(item.imagePaths).forEach((imagePath) => {
      const normalizedPath = normalizeString(imagePath);
      const baseName = path.basename(normalizedPath);

      if (!baseName || !fs.existsSync(normalizedPath) || sourcePaths.has(baseName.toLowerCase())) {
        return;
      }

      sourcePaths.set(baseName.toLowerCase(), normalizedPath);
    });
  });

  return sourcePaths;
}

function createNamePlanner(knownOldBasenames, sourcePaths) {
  const reservedNames = new Set();

  return function planNames(numeroSelo, createdAt, currentNames) {
    const baseName = buildRadioImageBaseName(numeroSelo, createdAt);

    return currentNames.map((currentName, index) => {
      const currentKey = currentName.toLowerCase();
      const extension = path.extname(currentName).replace('.', '') || 'jpg';
      let sequence = index + 1;

      while (true) {
        const candidate = buildRadioImageFileName(baseName, sequence, extension);
        const candidateKey = candidate.toLowerCase();
        const candidatePath = path.join(radioImagesDirectory, candidate);
        const occupiedByForeignExistingFile =
          fs.existsSync(candidatePath) &&
          !knownOldBasenames.has(candidateKey) &&
          !sourcePaths.has(candidateKey);

        if (candidateKey === currentKey) {
          reservedNames.add(candidateKey);
          return candidate;
        }

        if (!reservedNames.has(candidateKey) && !occupiedByForeignExistingFile) {
          reservedNames.add(candidateKey);
          return candidate;
        }

        sequence += 1;
      }
    });
  };
}

async function updateDatabaseRecord(pool, availableColumns, record, nextNames) {
  const assignments = [];
  const request = pool.request();

  if (availableColumns.includes('ImagePath')) {
    assignments.push('[ImagePath] = @imagePath');
    request.input('imagePath', sql.NVarChar, nextNames[0] || null);
  }

  if (availableColumns.includes('ImageNames')) {
    assignments.push('[ImageNames] = @imageNames');
    request.input('imageNames', sql.NVarChar, JSON.stringify(nextNames));
  }

  if (availableColumns.includes('ImagePaths')) {
    assignments.push('[ImagePaths] = @imagePaths');
    request.input('imagePaths', sql.NVarChar, JSON.stringify(nextNames));
  }

  if (assignments.length === 0) {
    return false;
  }

  let whereClause = '';

  if (availableColumns.includes('LocalId') && normalizeString(record.LocalId)) {
    request.input('localId', sql.NVarChar, normalizeString(record.LocalId));
    whereClause = '[LocalId] = @localId';
  } else {
    request.input('numeroSelo', sql.NVarChar, normalizeString(record.NumeroSelo));

    if (availableColumns.includes('DataCriacaoApp') && record.DataCriacaoApp) {
      request.input('dataCriacaoApp', sql.DateTime2, record.DataCriacaoApp);
      whereClause = '[NumeroSelo] = @numeroSelo AND [DataCriacaoApp] = @dataCriacaoApp';
    } else if (availableColumns.includes('ImagePath') && normalizeString(record.ImagePath)) {
      request.input('imagePathOld', sql.NVarChar, normalizeString(record.ImagePath));
      whereClause = '[NumeroSelo] = @numeroSelo AND [ImagePath] = @imagePathOld';
    } else {
      return false;
    }
  }

  await request.query(`
    UPDATE dbo.ConferenciaRadios
    SET ${assignments.join(', ')}
    WHERE ${whereClause}
  `);

  return true;
}

async function main() {
  const fallbackItems = readLocalFallback();

  if (!fs.existsSync(radioImagesDirectory)) {
    throw new Error(`Diretorio de imagens de radios nao encontrado: ${radioImagesDirectory}`);
  }

  const pool = await getPool();
  const columns = await getColumnNames(pool, 'dbo', 'ConferenciaRadios');
  const selectedColumns = [
    'LocalId',
    'NumeroSelo',
    'ImagePath',
    'ImageNames',
    'ImagePaths',
    'DataCriacaoApp',
    'DataAtualizacaoApp',
    'DataRecebimentoServidor',
  ].filter((columnName) => columns.includes(columnName));

  if (!selectedColumns.includes('NumeroSelo')) {
    throw new Error('Tabela dbo.ConferenciaRadios sem a coluna NumeroSelo.');
  }

  const dbRows =
    selectedColumns.length > 0
      ? (
          await pool.request().query(`
            SELECT ${selectedColumns.map((columnName) => `[${columnName}]`).join(', ')}
            FROM dbo.ConferenciaRadios
          `)
        ).recordset
      : [];

  const dbRecords = dbRows
    .map((row) => ({
      ...row,
      currentNames: getRecordImageNames(row),
      createdAt: toValidDate(
        row.DataCriacaoApp,
        row.DataAtualizacaoApp,
        row.DataRecebimentoServidor,
      ),
    }))
    .filter(
      (record) =>
        normalizeString(record.NumeroSelo) &&
        record.createdAt &&
        record.currentNames.length > 0,
    );

  const fallbackRecords = fallbackItems
    .map((item, index) => ({
      index,
      item,
      currentNames: uniqueBasenames([
        ...parseJsonArrayField(item.imageNames),
        ...parseJsonArrayField(item.imagePaths),
        normalizeString(item.imagePath),
      ]),
      createdAt: toValidDate(item.createdAt, item.updatedAt, item.receivedAt),
      numeroSelo: normalizeString(item.numeroSelo),
    }))
    .filter(
      (record) =>
        record.numeroSelo &&
        record.createdAt &&
        record.currentNames.length > 0,
    );

  const knownOldBasenames = new Set(
    [...dbRecords, ...fallbackRecords].flatMap((record) =>
      record.currentNames.map((name) => name.toLowerCase()),
    ),
  );
  const sourcePaths = buildSourcePathMap(fallbackItems);
  const planNames = createNamePlanner(knownOldBasenames, sourcePaths);
  const finalNameByOldName = new Map();
  const renameTasks = new Map();

  dbRecords.forEach((record) => {
    record.plannedNames = planNames(
      normalizeString(record.NumeroSelo),
      record.createdAt,
      record.currentNames,
    );

    record.currentNames.forEach((oldName, index) => {
      const oldKey = oldName.toLowerCase();
      const nextName = record.plannedNames[index];

      if (!finalNameByOldName.has(oldKey)) {
        finalNameByOldName.set(oldKey, nextName);
      }

      if (oldKey !== nextName.toLowerCase()) {
        renameTasks.set(oldKey, {
          oldName,
          nextName,
        });
      }
    });
  });

  fallbackRecords.forEach((record) => {
    record.plannedNames = record.currentNames.map((oldName) => {
      const existing = finalNameByOldName.get(oldName.toLowerCase());

      if (existing) {
        return existing;
      }

      const planned = planNames(record.numeroSelo, record.createdAt, [oldName])[0];
      finalNameByOldName.set(oldName.toLowerCase(), planned);

      if (oldName.toLowerCase() !== planned.toLowerCase()) {
        renameTasks.set(oldName.toLowerCase(), {
          oldName,
          nextName: planned,
        });
      }

      return planned;
    });
  });

  let renamedFiles = 0;
  let alreadyRenamedFiles = 0;
  let missingFiles = 0;

  for (const task of renameTasks.values()) {
    const oldKey = task.oldName.toLowerCase();
    const sourcePath =
      sourcePaths.get(oldKey) || sourcePaths.get(task.nextName.toLowerCase());
    const targetPath = path.join(radioImagesDirectory, task.nextName);

    if (
      normalizeString(sourcePath) &&
      path.win32.normalize(sourcePath).toLowerCase() ===
        path.win32.normalize(targetPath).toLowerCase()
    ) {
      continue;
    }

    if (fs.existsSync(targetPath)) {
      finalNameByOldName.set(oldKey, task.nextName);
      sourcePaths.set(task.nextName.toLowerCase(), targetPath);
      alreadyRenamedFiles += 1;
      continue;
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      finalNameByOldName.set(oldKey, task.oldName);
      missingFiles += 1;
      continue;
    }

    await moveFile(sourcePath, targetPath);
    finalNameByOldName.set(oldKey, task.nextName);
    sourcePaths.set(task.nextName.toLowerCase(), targetPath);
    renamedFiles += 1;
  }

  let updatedDbRows = 0;

  for (const record of dbRecords) {
    const nextNames = record.currentNames.map(
      (oldName) => finalNameByOldName.get(oldName.toLowerCase()) || oldName,
    );

    const changed =
      JSON.stringify(nextNames) !== JSON.stringify(record.currentNames) ||
      normalizeString(record.ImagePath) !== normalizeString(nextNames[0] || '');

    if (!changed) {
      continue;
    }

    const updated = await updateDatabaseRecord(pool, columns, record, nextNames);

    if (updated) {
      updatedDbRows += 1;
    }
  }

  const updatedFallbackItems = [...fallbackItems];
  let updatedFallbackRows = 0;

  fallbackRecords.forEach((record) => {
    const nextNames = record.currentNames.map(
      (oldName) => finalNameByOldName.get(oldName.toLowerCase()) || oldName,
    );
    const nextPaths = nextNames.map((name) => path.join(radioImagesDirectory, name));
    const currentItem = updatedFallbackItems[record.index];
    const changed =
      JSON.stringify(nextNames) !== JSON.stringify(record.currentNames) ||
      normalizeString(currentItem?.imagePath) !== normalizeString(nextNames[0] || '');

    if (!changed) {
      return;
    }

    updatedFallbackItems[record.index] = {
      ...currentItem,
      imageNames: nextNames,
      imagePaths: nextPaths,
      imagePath: nextNames[0] || null,
    };
    updatedFallbackRows += 1;
  });

  if (updatedFallbackRows > 0) {
    writeLocalFallback(updatedFallbackItems);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        radioImagesDirectory,
        legacyLocalRadioImagesDirectory,
        renamedFiles,
        alreadyRenamedFiles,
        missingFiles,
        updatedDbRows,
        updatedFallbackRows,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exit(1);
  });
