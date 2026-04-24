# Build e Release

## Rodando em desenvolvimento

### Backend

```bash
npm run server
```

O comando inicia o servidor Express definido em `server/index.js`.

### App mobile

```bash
npx expo start -c
```

O comando inicia o Metro Bundler e limpa o cache do Expo.

Atalhos uteis:

```bash
npm run android
npm run ios
npm run web
```

## Variaveis importantes

### App

- `EXPO_PUBLIC_API_URL`: URL base consumida pelo app

### Backend

- `PORT`
- `DB_SERVER`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_ENCRYPT`
- `DB_TRUST_SERVER_CERTIFICATE`
- `ALMOX_DB_NAME`
- `RADIO_IMAGES_DIR`

## Build Android local

### Opcao 1. Usando Expo

```bash
npx expo run:android --variant release
```

O comando compila o app Android localmente em modo release.

### Opcao 2. Usando Gradle diretamente

```bash
cd android
.\gradlew assembleRelease
```

O comando gera o APK release usando o projeto Android ja existente na pasta `android/`.

## EAS Build

O projeto ja possui `eas.json` com dois perfis:

- `preview`: gera APK
- `production`: gera Android App Bundle

### Primeira configuracao

```bash
npm install -g eas-cli
eas login
```

### Gerar APK de preview

```bash
eas build -p android --profile preview
```

### Gerar AAB de producao

```bash
eas build -p android --profile production
```

## Checklist antes do release

- confirmar `EXPO_PUBLIC_API_URL`
- validar `/health` no backend
- testar login
- validar permissao e acesso ao `RADIO_IMAGES_DIR`
- testar sincronizacao offline de radios, inventario e PCP
- conferir se o `.env` local nao sera publicado no Git

## Publicacao do backend

O backend nao gera APK. Ele roda como processo Node separado.

Opcoes comuns:

- `node ./server/index.js`
- PM2
- NSSM / Windows Service
- IIS com reverse proxy

Use quando quiser gerar build no seu computador:

```bash
cd C:\Users\Lar\Desktop\UISyncMobile
npx expo prebuild

cd android
.\gradlew assembleRelease
```