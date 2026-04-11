# Estrutura do Projeto

## Visao geral

O projeto esta dividido em app mobile, servicos compartilhados e backend HTTP.

## Pastas principais

### `app/`

Responsavel pelas telas e rotas do app via Expo Router.

- `app/_layout.tsx:1-11`
  Inicializa o router e sobe o bootstrap de sincronizacao.
- `app/index.tsx:6-38`
  Decide se o usuario vai para `/login` ou `/home` com base na sessao salva.
- `app/login/index.tsx:18-124`
  Tela de login com autenticacao real no banco.
- `app/home/index.tsx:13-83`
  Home principal, saudacao e exibicao dos setores disponiveis.
- `app/forms/fiscal/home.tsx:8-61`
  Home do Fiscal com protecao por setor.
- `app/forms/fiscal/radios/index.tsx:83-465`
  Formulario completo de radios.

### `components/`

Componentes reutilizaveis de interface.

- `components/ButtonSelect.tsx`
  Botao de selecao usado no checklist.
- `components/CardSetor.tsx`
  Card usado na home para navegar entre setores.

### `services/`

Contem a regra de negocio e o acesso local/remoto.

#### `services/auth.ts`

- `services/auth.ts:3-37`
  Modelo da sessao autenticada, persistencia da sessao e regra de acesso por setor.

#### `services/radios.ts`

- `services/radios.ts:21-71`
  Persistencia local das imagens do formulario.
- `services/radios.ts:87-117`
  Verificacao se o radio ja foi conferido no dia.
- `services/radios.ts:119-146`
  Montagem da conferencia e entrada na fila offline.

#### `services/sync/`

- `services/sync/storage.ts:1-22`
  Chaves e persistencia com AsyncStorage.
- `services/sync/api.ts:11-127`
  Cliente HTTP do app.
- `services/sync/queue.ts:14-189`
  Fila offline, validacao de payload e sincronizacao automatica.
- `services/sync/bootstrap.ts`
  Dispara sincronizacao ao abrir o app e quando a conectividade muda.
- `services/sync/types.ts`
  Tipos do payload da conferencia e das imagens.

### `server/`

Backend Node/Express que conversa com o SQL Server e com a pasta de imagens.

- `server/db.js`
  Configuracao da conexao SQL Server.
- `server/index.js:11-49`
  Configuracao do servidor, pasta de imagens e Multer.
- `server/index.js:102-449`
  Endpoints HTTP.

## Fluxos principais

### Login

1. Usuario digita matricula e senha em `app/login/index.tsx:24-48`
2. App chama `services/sync/api.ts:108-127`
3. Backend valida em `server/index.js:170-223`
4. Sessao local e salva por `services/auth.ts:13-23`

### Conferencia de radios

1. Usuario abre a tela em `app/forms/fiscal/radios/index.tsx:318-465`
2. Checklist, imagens e observacao sao preenchidos
3. Ao salvar, a conferencia e montada em `services/radios.ts:119-146`
4. O item entra na fila em `services/sync/queue.ts:117-189`
5. O backend recebe e grava em `server/index.js:273-449`

### Controle de acesso

- Regra global do setor `0000`: `services/auth.ts:11-37`
- Home filtra setores por usuario: `app/home/index.tsx:39-47`
- Fiscal e radios bloqueiam acesso direto: `app/forms/fiscal/home.tsx:12-39` e `app/forms/fiscal/radios/index.tsx:97-117`
