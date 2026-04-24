# UISyncMobile

## Visao geral

UISyncMobile e um aplicativo mobile para registro operacional em campo, com autenticacao por usuario do banco, controle de acesso por setor e suporte offline.

Hoje o projeto esta organizado em tres frentes principais:

- app mobile em Expo/React Native
- camada de servicos compartilhados para regra de negocio e persistencia local
- backend Express que conversa com SQL Server e com armazenamento de imagens

## O que o projeto entrega hoje

- login com usuarios do banco `Forms`
- controle de acesso por setor, com setor `0000` liberando acesso global
- home principal com navegacao por setor
- almoxarifado com inventario e base offline de produtos
- fiscal com lista de radios, conferencia separada e cadastro de radios
- pcp com medicao de estoque e progresso salvo localmente
- fila offline compartilhada para radios, inventario e medicoes
- sincronizacao automatica quando o app volta ao foreground ou a conexao reaparece
- upload de imagens para radios e inventario
- fallbacks locais no backend para quando algum registro precisa ser preservado fora do banco

## Modulos atuais

### Almoxarifado

- mini-home do setor
- formulario de inventario
- busca por codigo de barras
- catalogo offline de produtos
- foto opcional da contagem

### Fiscal

- mini-home do setor
- lista de radios para conferencia
- tela separada para conferencia de radios
- cadastro de radios com schema dinamico e donos vinculados
- relatorio e status de conferencia por janela de dias

### PCP

- mini-home do setor
- medicao de estoque com progresso local
- envio pela mesma fila offline compartilhada

## Arquitetura resumida

- `app/` contem as telas e rotas do Expo Router.
- `services/` concentra autenticacao, regras de cada formulario, armazenamento local e cliente HTTP.
- `services/sync/` concentra fila offline, bootstrap, tipos e chaves do AsyncStorage.
- `server/` concentra os endpoints, o acesso ao SQL Server, o upload de imagens e os fallbacks locais.

## Como rodar o projeto

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variaveis de ambiente

Crie ou ajuste o arquivo `.env` na raiz com pelo menos:

```env
EXPO_PUBLIC_API_URL=http://SEU_IP:3000
PORT=3000
DB_SERVER=SEU_SERVIDOR
DB_PORT=1433
DB_NAME=Forms
DB_USER=SEU_USUARIO
DB_PASSWORD=SUA_SENHA
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
ALMOX_DB_NAME=Almox
RADIO_IMAGES_DIR=\\\\servidor\\pasta\\ConferenciaRadiosImagens
```

### 3. Subir o backend

```bash
npm run server
```

### 4. Subir o app

```bash
npx expo start -c
```

Atalhos uteis:

```bash
npm run android
npm run web
```

## Fluxos principais

### Login

1. O usuario informa matricula e senha.
2. O app chama `POST /api/auth/login`.
3. O backend valida no banco e devolve a sessao.
4. A sessao e salva localmente no AsyncStorage.

### Fiscal - radios

1. O usuario entra na lista de radios.
2. A lista consulta o servidor ou o cache offline do aparelho.
3. Ao tocar em um item, a navegacao abre a tela de conferencia com o selo selecionado.
4. A conferencia salva os dados localmente, entra na fila e tenta sincronizar.
5. O backend grava a conferencia e as imagens no destino configurado.

### Fiscal - cadastro de radios

1. O app carrega o schema dinamico do cadastro.
2. A listagem de radios cadastrados e exibida para busca e edicao.
3. O usuario pode criar ou atualizar radio e seus donos vinculados.

### Almoxarifado - inventario

1. O usuario consulta o produto por codigo de barras.
2. O app tenta cache local antes de buscar no servidor.
3. A contagem e salva localmente e enviada pela fila offline.

### PCP - medicao de estoque

1. O usuario abre a sessao de medicao.
2. As leituras sao salvas localmente.
3. O envio segue pela mesma fila de sincronizacao.

## Documentos complementares

- `docs/ESTRUTURA.md`: mapa de pastas, telas e responsabilidades
- `docs/API.md`: endpoints, integracoes e permissoes
- `docs/BUILD.md`: desenvolvimento, builds locais e EAS Build
- `docs/GitHub.md`: comandos para publicar o projeto no GitHub
