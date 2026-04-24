# UISyncMobile

UISyncMobile e um projeto mobile em Expo/React Native com backend Express + SQL Server para registro operacional com suporte offline.

## Modulos atuais

- Almoxarifado: inventario com busca por codigo de barras, foto e fila offline.
- Fiscal: lista de radios, conferencia com checklist e fotos, e cadastro de radios.
- PCP: medicao de estoque com salvamento local e sincronizacao automatica.
- Sincronizacao offline: fila compartilhada para radios, inventario e medicoes.

## Stack principal

- Expo / React Native / Expo Router
- AsyncStorage / NetInfo / Expo File System / Expo Image Picker / Expo Camera
- Node.js / Express / MSSQL / Multer

## Como rodar

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar `.env`

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

## Pastas principais

- `app/`: telas e rotas do app.
- `components/`: componentes reutilizaveis de interface.
- `services/`: regra de negocio, cache local e cliente HTTP.
- `server/`: API Express, SQL Server e fallbacks locais.
- `docs/`: documentacao complementar.

## Documentacao complementar

- [Visao geral](docs/README.md)
- [Estrutura do projeto](docs/ESTRUTURA.md)
- [API e integracoes](docs/API.md)
- [Build e release](docs/BUILD.md)
- [Publicacao no GitHub](docs/GitHub.md)
