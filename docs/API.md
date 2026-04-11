# API e Permissoes

## Base URL

A URL base da API no app e definida em:

- `services/sync/api.ts:4-8`

Ela usa:

- `EXPO_PUBLIC_API_URL`

## Endpoints

### `GET /health`

Valida se o backend esta no ar e se a conexao com o banco `Forms` esta funcionando.

Codigo:

- `server/index.js:102-125`

Uso no app:

- `services/sync/api.ts:97-106`
- `services/sync/queue.ts:70-82`

### `POST /api/auth/login`

Autentica o usuario na tabela `dbo.Usuarios`.

Entrada:

```json
{
  "matricula": "111000",
  "senha": "senha123"
}
```

Saida:

```json
{
  "matricula": "111000",
  "nome": "UsuarioTesteGestor",
  "setor": "0000",
  "unidade": "124",
  "tipoUsuario": "Gestor"
}
```

Codigo:

- Backend: `server/index.js:170-223`
- Cliente mobile: `services/sync/api.ts:108-127`
- Tela de login: `app/login/index.tsx:24-48`

### `GET /api/radios/search`

Busca selos em `dbo.dimRadios`.

Exemplo:

```http
GET /api/radios/search?query=240942
```

Codigo:

- Backend: `server/index.js:127-168`
- Cliente mobile: `services/sync/api.ts:11-33`
- Uso no formulario: `app/forms/fiscal/radios/index.tsx:119-165`

### `GET /api/conferencias/radios/check`

Verifica se um `NumeroSelo` ja teve conferencia no dia atual.

Exemplo:

```http
GET /api/conferencias/radios/check?numeroSelo=240942
```

Resposta:

```json
{
  "alreadyCheckedToday": true
}
```

Codigo:

- Backend: `server/index.js:225-271`
- Cliente mobile: `services/sync/api.ts:35-53`
- Regra local/remota no app: `services/radios.ts:87-117`

### `POST /api/conferencias/radios`

Recebe a conferencia de radios com imagens em `multipart/form-data`.

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

Codigo:

- Montagem do `FormData`: `services/sync/api.ts:55-95`
- Insert no banco: `server/index.js:366-425`
- Salvamento das imagens: `server/index.js:30-49`

## Permissoes do app

### Camera

Necessaria para tirar foto do radio no formulario.

Codigo:

- `app/forms/fiscal/radios/index.tsx:186-193`

### Galeria / biblioteca de midia

Necessaria para selecionar imagens ja existentes.

Codigo:

- `app/forms/fiscal/radios/index.tsx:193-203`

### Armazenamento local

Usado para:

- guardar sessao do usuario
- manter fila offline
- persistir conferencias
- copiar imagens para reenvio posterior

Codigo:

- Sessao: `services/auth.ts:13-23`
- AsyncStorage: `services/sync/storage.ts:1-22`
- Fila offline: `services/sync/queue.ts:42-189`
- Imagens locais: `services/radios.ts:27-71`

## Regras de acesso por setor

- `0000` acessa todos os formularios
- `1161` acessa o formulario de radios

Codigo:

- Regra-base: `services/auth.ts:11-37`
- Filtro da home: `app/home/index.tsx:39-47`
- Protecao da home Fiscal: `app/forms/fiscal/home.tsx:12-39`
- Protecao da tela de radios: `app/forms/fiscal/radios/index.tsx:97-117`
