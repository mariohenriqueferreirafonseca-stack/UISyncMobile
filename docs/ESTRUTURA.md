# Estrutura do Projeto

## Visao geral

O projeto esta dividido em app mobile, componentes reutilizaveis, servicos compartilhados e backend HTTP.

## Arvore principal

```text
UISyncMobile/
|-- app/
|   |-- _layout.tsx
|   |-- index.tsx
|   |-- login/
|   |   `-- index.tsx
|   |-- home/
|   |   `-- index.tsx
|   `-- forms/
|       |-- almoxarifado/
|       |   |-- index.tsx
|       |   `-- inventario/
|       |       `-- index.tsx
|       |-- fiscal/
|       |   |-- home.tsx
|       |   `-- radios/
|       |       |-- index.tsx
|       |       |-- conferencia.tsx
|       |       `-- cadastro.tsx
|       `-- pcp/
|           |-- index.tsx
|           `-- medicao_estoque/
|               `-- index.tsx
|-- components/
|   |-- CardSetor.tsx
|   `-- ButtonSelect.tsx
|-- services/
|   |-- auth.ts
|   |-- inventory.ts
|   |-- radios.ts
|   |-- radioRegistry.ts
|   |-- stockMeasurement.ts
|   `-- sync/
|       |-- api.ts
|       |-- bootstrap.ts
|       |-- queue.ts
|       |-- storage.ts
|       `-- types.ts
|-- server/
|   |-- db.js
|   |-- index.js
|   `-- data/
|       |-- inventory-counts.json
|       |-- radio-conferences.json
|       `-- stock-measurements.json
`-- docs/
    |-- README.md
    |-- ESTRUTURA.md
    |-- API.md
    |-- BUILD.md
    `-- GitHub.md
```

## Responsabilidade por pasta

### `app/`

Contem as telas e rotas do Expo Router.

- `app/index.tsx`: decide entre `/login` e `/home`
- `app/_layout.tsx`: inicia o router e o bootstrap da fila offline
- `app/login/`: autenticacao
- `app/home/`: home principal por setor
- `app/forms/almoxarifado/`: mini-home e inventario
- `app/forms/fiscal/`: mini-home do fiscal
- `app/forms/fiscal/radios/index.tsx`: lista de radios para conferencia
- `app/forms/fiscal/radios/conferencia.tsx`: formulario de conferencia
- `app/forms/fiscal/radios/cadastro.tsx`: cadastro e edicao de radios
- `app/forms/pcp/`: mini-home e medicao de estoque

### `components/`

Componentes visuais reutilizaveis.

- `CardSetor.tsx`: card usado na home principal
- `ButtonSelect.tsx`: botao de selecao usado em checklists

### `services/`

Regra de negocio, persistencia local e integracoes remotas.

- `auth.ts`: sessao local e regra de acesso por setor
- `inventory.ts`: fluxo do inventario
- `radios.ts`: fluxo de radios, cache offline, lista, conferencia e relatorio
- `radioRegistry.ts`: CRUD do cadastro de radios
- `stockMeasurement.ts`: criacao e persistencia da medicao de estoque

### `services/sync/`

Infraestrutura compartilhada entre os formularios.

- `api.ts`: cliente HTTP central do app
- `bootstrap.ts`: dispara sincronizacao ao abrir o app e quando a rede volta
- `queue.ts`: fila offline compartilhada
- `storage.ts`: chaves e leitura/escrita no AsyncStorage
- `types.ts`: contratos de payload, cache e fila

### `server/`

Backend Node/Express.

- `db.js`: conexao com SQL Server
- `index.js`: endpoints HTTP, upload de imagens e consultas SQL
- `data/`: fallbacks locais de radios, inventario e medicoes

## Fluxos principais

### Login e acesso

1. O app carrega a sessao salva no AsyncStorage.
2. Sem sessao, redireciona para `/login`.
3. Com sessao, redireciona para `/home`.
4. A home filtra os setores liberados para o usuario.

### Fila offline

1. Cada formulario salva primeiro localmente.
2. Um item entra na fila com `entityType`.
3. O bootstrap tenta sincronizar em foreground e quando a rede volta.
4. O backend recebe o payload e responde.
5. O item local e marcado como sincronizado.

### Backend e fallbacks

O backend tenta gravar no banco e manter a integracao principal, mas tambem possui arquivos locais em `server/data/` para preservar registros quando necessario.
