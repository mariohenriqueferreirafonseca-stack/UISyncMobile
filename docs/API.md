# API e Integracoes

## Base URL

O app usa `EXPO_PUBLIC_API_URL` como URL base para todas as chamadas HTTP.

Exemplo:

```env
EXPO_PUBLIC_API_URL=http://192.168.137.244:3000
```

## Endpoints

### Infraestrutura

#### `GET /health`

Valida se o backend esta no ar e se a conexao principal com o banco esta disponivel.

Uso principal:

- diagnostico rapido
- teste de disponibilidade
- suporte ao fluxo de sincronizacao offline

### Autenticacao

#### `POST /api/auth/login`

Autentica o usuario no banco e devolve os dados de sessao usados pelo app.

Campos esperados:

```json
{
  "matricula": "111000",
  "senha": "senha123"
}
```

Resposta esperada:

```json
{
  "matricula": "111000",
  "nome": "Usuario Teste",
  "setor": "0000",
  "unidade": "124",
  "tipoUsuario": "Gestor"
}
```

### Radios - consulta, conferencia e relatorio

#### `GET /api/radios/search`

Busca radios por selo.

Parametros:

- `query`

#### `GET /api/radios/catalog`

Baixa o catalogo completo de radios para uso offline no app.

#### `GET /api/radios/list`

Lista radios para conferencia com filtros e status de conferencia.

Parametros opcionais:

- `setor`
- `selo`
- `limit`

#### `GET /api/conferencias/radios/check`

Verifica se um selo ja foi conferido.

Parametros:

- `numeroSelo`
- `days` opcional para janela de dias

Resposta esperada:

```json
{
  "alreadyCheckedToday": true,
  "alreadyCheckedInWindow": true,
  "days": 7
}
```

#### `POST /api/conferencias/radios`

Recebe a conferencia de radios em `multipart/form-data`.

Campos enviados pelo app:

- `localId`
- `numeroSelo`
- `usuarioNome`
- `equipamentoOperante`
- `botaoFunciona`
- `bateriaEncaixa`
- `existemRachaduras`
- `riscosProfundos`
- `capaProtetora`
- `alcaTransporte`
- `identificacaoIntegra`
- `equipamentoLimpo`
- `situacaoGeral`
- `observacao`
- `createdAt`
- `updatedAt`
- `images[]`

#### `GET /api/relatorios/radios`

Emite relatorio consolidado de radios e ultima conferencia.

Parametros opcionais:

- `numeroSelo`
- `limit`

#### `GET /api/radio-images/:fileName`

Serve imagens de radios gravadas no servidor.

### Radios - cadastro

#### `GET /api/radios/registry/schema`

Devolve o schema dinamico do cadastro de radios.

#### `GET /api/radios/registry`

Lista radios cadastrados.

Parametro opcional:

- `query`

#### `GET /api/radios/registry/:selo`

Carrega um radio especifico para edicao.

#### `POST /api/radios/registry`

Cria um novo cadastro de radio.

#### `PUT /api/radios/registry/:selo`

Atualiza um cadastro existente.

### Almoxarifado

#### `GET /api/almox/produtos/by-barcode/:codigoBarras`

Consulta um produto por codigo de barras.

#### `GET /api/almox/produtos/catalog`

Baixa o catalogo completo de produtos para uso offline.

#### `POST /api/almox/contagens`

Recebe uma contagem de inventario.

Campos principais:

- `localId`
- `codigoBarras`
- `codigoProduto`
- `quantidadeFisica`
- `observacao`
- `usuarioNome`
- `usuarioMatricula`
- `createdAt`
- `updatedAt`
- `foto` opcional

### PCP

#### `POST /api/pcp/medicoes-estoque`

Recebe uma medicao de estoque consolidada.

Campos principais:

- `localId`
- `id_medicao`
- `data_medicao`
- `usuario_medicao`
- `usuario_matricula`
- `nome_afericao`
- `nome_armazem`
- `rows`
- `createdAt`
- `updatedAt`

## Persistencia local e fallback

### No app

O app usa AsyncStorage para:

- sessao autenticada
- fila offline
- conferencias de radios
- contagens de inventario
- medicoes de estoque
- catalogos offline

### No backend

O backend mantem arquivos em `server/data/` para preservar registros locais:

- `radio-conferences.json`
- `inventory-counts.json`
- `stock-measurements.json`

## Permissoes do app

### Camera

Usada para capturar imagens em radios e inventario.

### Galeria

Usada para selecionar imagens existentes no aparelho.

### Armazenamento local

Usado para:

- sessao
- cache offline
- fila offline
- copia local de imagens

### Rede

Usada para:

- login
- sincronizacao da fila
- atualizacao de catalogos offline
- consultas online de radios e produtos
