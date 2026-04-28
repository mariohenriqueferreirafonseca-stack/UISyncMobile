# UISyncMobile

UISyncMobile e um app mobile em Expo/React Native com backend em Node.js + Express + SQL Server para operacao de formularios internos com suporte offline.

## O que o app faz

- Almoxarifado: inventario com leitura manual/codigo de barras, foto e fila offline.
- Fiscal: conferencia de radios com checklist, fotos e cadastro de radios.
- PCP: medicao de estoque com salvamento local e sincronizacao.
- Sincronizacao offline: fila compartilhada para radios, inventario e medicoes.

## Stack principal

- Expo
- React Native
- Expo Router
- AsyncStorage
- NetInfo
- Expo Image Picker
- Expo Camera
- Node.js
- Express
- MSSQL
- Multer

## Requisitos

- Node.js 20+ recomendado
- npm
- Banco SQL Server acessivel
- Celular Android na mesma rede da API para testes locais

## Como rodar o projeto

### 1. Instalar as dependencias

```bash
npm install
```

### 2. Configurar o arquivo `.env`

Crie ou ajuste o `.env` com os valores do seu ambiente:

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

Observacao:
- `EXPO_PUBLIC_API_URL` e a URL da API que o app vai usar.
- Se esse valor mudar, o app precisa ser reiniciado e um novo build precisa ser gerado para APK final.

### 3. Subir o backend

```bash
npm run server
```

Esse comando sobe a API em `http://SEU_IP:3000` usando `server/index.js`.

### 4. Subir o app

```bash
npx expo start -c
```

Esse comando sobe o Metro/Expo e limpa o cache.

## Scripts uteis

```bash
npm run server
npm run android
npm run ios
npm run web
npm run lint
npm run migrate:radio-images
```

O que cada um faz:
- `npm run server`: sobe o backend local.
- `npm run android`: abre o app Android nativo pelo Expo.
- `npm run ios`: abre o app iOS nativo pelo Expo.
- `npm run web`: roda a versao web.
- `npm run lint`: verifica padrao de codigo.
- `npm run migrate:radio-images`: roda a migracao de nomes das imagens de conferencia de radios.

## Estrutura principal

- `app/`: rotas e telas do app.
- `components/`: componentes reutilizaveis de interface.
- `services/`: regras de negocio, cache local, sync e cliente HTTP.
- `server/`: API, conexao com SQL Server e fallbacks locais.
- `android/`: projeto Android nativo.
- `docs/`: documentacao complementar.

## Modulos do app

### Almoxarifado

- Home do setor
- Inventario
- Base offline do catalogo
- Fotos e sincronizacao em fila

### Fiscal

- Home do setor
- Lista de radios para conferencia
- Formulario de conferencia
- Cadastro de radios

### PCP

- Home do setor
- Medicao de estoque por arco
- Leitura por lado direito e esquerdo
- Salvamento local e envio posterior

## Documentacao complementar

- [Build simples para APK](docs/BUILD.md)
- [Enviar o projeto para Git e GitHub](docs/GitHub.md)
