// Camada única de conexão com SQL Server.
// O backend reaproveita o pool global para não abrir conexão nova a cada request.
const sql = require('mssql');

let poolPromise;

function readBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

function getConfig() {
  // Aqui vivem apenas as credenciais/flags da conexão.
  // Regras de negócio e consultas ficam fora deste arquivo.
  const requiredKeys = ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(
      `Variaveis de ambiente ausentes para o SQL Server: ${missingKeys.join(', ')}.`,
    );
  }

  return {
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT || 1433),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: readBoolean(process.env.DB_ENCRYPT, false),
      trustServerCertificate: readBoolean(
        process.env.DB_TRUST_SERVER_CERTIFICATE,
        true,
      ),
    },
  };
}

async function getPool() {
  if (!poolPromise) {
    const config = getConfig();
    poolPromise = sql.connect(config);
  }

  return poolPromise;
}

module.exports = {
  sql,
  getPool,
};