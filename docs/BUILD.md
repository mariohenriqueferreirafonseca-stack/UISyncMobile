# Build e APK

## Rodando em desenvolvimento

### Backend

```bash
npm run server
```

Codigo:

- Script: `package.json:5-13`
- Servidor: `server/index.js:451-455`

### App mobile

```bash
npx expo start -c
```

Atalhos ja definidos:

```bash
npm run android
npm run ios
npm run web
```

Codigo:

- Scripts: `package.json:5-13`

## Variaveis importantes

### App

- `EXPO_PUBLIC_API_URL`
  Define para onde o app envia login, busca de selo e conferencias.

Referencia:

- `services/sync/api.ts:4-8`

### Backend

- `PORT`
- `DB_SERVER`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_ENCRYPT`
- `DB_TRUST_SERVER_CERTIFICATE`
- `RADIO_IMAGES_DIR`

Referencia:

- `server/index.js:11-28`
- `server/db.js`

## Como gerar APK

## Opcao A. Build Android local

Use quando voce tem Android Studio / SDK configurado na maquina:

```bash
npx expo run:android --variant release
```

O comando faz o prebuild nativo e gera o app Android em modo release.

Observacoes:

- como o projeto hoje usa Expo Router e ainda nao versiona a pasta `android`, o comando vai gerar os arquivos nativos localmente
- depois disso voce pode abrir o projeto Android no Android Studio e gerar `.apk` ou `.aab`

Base do projeto Expo:

- `package.json:2-13`

## Opcao B. EAS Build

Use quando quiser gerar build em nuvem:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

Observacoes:

- o repositorio ainda nao possui `eas.json`
- portanto o `eas build:configure` precisa ser executado na primeira vez

## Build do backend

O backend nao gera APK; ele roda como processo Node separado.

Para producao, voce pode:

- rodar com `node ./server/index.js`
- ou publicar atras de PM2, NSSM, Windows Service, IIS reverse proxy ou outro gerenciador de processo

Trecho principal:

- `server/index.js:11-455`

## O que revisar antes de gerar release

- conferir `EXPO_PUBLIC_API_URL`
- confirmar que o backend responde em `/health`
- testar login em `Usuarios`
- validar permissao dos compartilhamentos de imagens (`RADIO_IMAGES_DIR`)
- confirmar insert e upload de fotos no fluxo de radios

Referencias:

- API e health: `services/sync/api.ts:97-106` e `server/index.js:102-125`
- Login: `app/login/index.tsx:24-48` e `server/index.js:170-223`
- Upload de imagens: `app/forms/fiscal/radios/index.tsx:182-243` e `server/index.js:30-49`

Use quando quiser gerar build no seu computador:

```bash
cd C:\Users\Lar\Desktop\UISyncMobile
npx expo prebuild

cd android
.\gradlew assembleRelease
```