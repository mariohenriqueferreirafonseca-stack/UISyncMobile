# UISyncMobile

## 📌 Nome do projeto

UISyncMobile

## 📱 O que o app faz

O UISyncMobile e um aplicativo mobile para registrar conferencias operacionais por formulario, com foco atual no formulario de radios do setor Fiscal.

Hoje o app ja oferece:

- login com usuarios do banco `Forms`
- controle de acesso por setor
- busca de selo do radio
- checklist de conferencia
- salvamento offline
- sincronizacao automatica com o servidor
- bloqueio de dupla conferencia no mesmo dia
- captura e upload de imagens
- rastreabilidade basica com `UsuarioNome`

### Onde isso aparece no codigo

- Fluxo inicial e redirecionamento por sessao: `app/index.tsx:6-38`
- Login do usuario: `app/login/index.tsx:18-48`
- Home com saudacao e setores visiveis: `app/home/index.tsx:13-83`
- Formulario de radios: `app/forms/fiscal/radios/index.tsx:83-465`
- Sessao e regra de setor `0000`: `services/auth.ts:3-37`

## ⚙️ Tecnologias

- Expo: base do projeto mobile e entrypoint do app em `package.json:2-13`
- React Native: UI nativa em `package.json:41-49`
- Expo Router: navegacao por arquivos em `package.json:32` e `app/_layout.tsx:1-11`
- AsyncStorage: persistencia local da sessao e fila offline em `services/sync/storage.ts:1-22`
- NetInfo: verificacao de conectividade para sincronizacao em `services/sync/queue.ts:1-82`
- Expo Image Picker: camera e galeria no formulario em `app/forms/fiscal/radios/index.tsx:182-243`
- Expo File System: persistencia local das imagens em `services/radios.ts:1-71`
- Node.js + Express: backend HTTP em `server/index.js:1-455`
- SQL Server (`mssql`): acesso ao banco `Forms` em `server/db.js`
- Multer: recebimento de imagens multipart no backend em `server/index.js:30-49` e `server/index.js:273-449`

## 🚀 Como rodar o projeto

### 1. Instalar dependencias

```bash
npm install
```

Referencia:

- Scripts e dependencias: `package.json:5-58`

### 2. Configurar variaveis de ambiente

Crie ou ajuste o arquivo `.env` na raiz com pelo menos:

```env
PORT=3000
DB_SERVER=192.168.176.19
DB_PORT=1433
DB_NAME=Forms
DB_USER=SEU_USUARIO
DB_PASSWORD=SUA_SENHA
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
EXPO_PUBLIC_API_URL=http://SEU_IP_LOCAL:3000
RADIO_IMAGES_DIR=\\192.168.176.19\Aplicativos\UISyncMobile\ConferenciaRadiosImagens
```

Referencia:

- URL base usada pelo app: `services/sync/api.ts:4-8`
- Leitura do banco e pasta de imagens no backend: `server/index.js:11-28`

### 3. Subir o backend

```bash
npm run server
```

Referencia:

- Script do backend: `package.json:5-13`
- Bootstrap do servidor: `server/index.js:451-455`

### 4. Subir o app

```bash
npx expo start -c
```

Se quiser abrir direto no Android:

```bash
npm run android
```

Referencia:

- Scripts do app: `package.json:5-13`

## 🔌 Configuração da API

A API e consumida pelo app a partir de `EXPO_PUBLIC_API_URL`.

Os principais endpoints hoje sao:

- `POST /api/auth/login`
- `GET /api/radios/search`
- `GET /api/conferencias/radios/check`
- `POST /api/conferencias/radios`
- `GET /health`

Referencia:

- Cliente HTTP do app: `services/sync/api.ts:11-127`
- Endpoints do backend: `server/index.js:102-449`

## 📦 Como gerar APK

### Opcao 1. Geracao local Android

Para gerar build Android local, use:

```bash
npx expo run:android --variant release
```

Observacao:

- esse comando exige Android SDK e ambiente Android configurado na maquina
- ele vai gerar a pasta nativa Android durante o processo

### Opcao 2. EAS Build

Se voce quiser gerar APK/artefato em nuvem com Expo:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

Observacao:

- o projeto atualmente nao possui `eas.json`, entao o `eas build:configure` precisa ser executado primeiro
- a base Expo do projeto esta em `package.json:2-13`

## Documentos complementares

- Estrutura do projeto: `docs/ESTRUTURA.md`
- API e permissoes: `docs/API.md`
- Build e release: `docs/BUILD.md`
