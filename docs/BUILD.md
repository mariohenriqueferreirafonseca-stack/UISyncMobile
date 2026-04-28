# Build simples para APK

Este guia mostra o caminho mais simples para gerar um APK Android deste projeto.

## O que ja esta configurado no projeto

O projeto ja possui:

- `app.json` com pacote Android `com.mario.uisyncmobile`
- `eas.json` com perfil `preview` gerando `apk`
- `eas.json` com perfil `production` gerando `app-bundle`

Ou seja: para gerar um APK, o caminho mais simples hoje e usar o perfil `preview`.

## Requisitos

- Node.js e npm instalados
- Dependencias do projeto instaladas
- Conta Expo/EAS
- Internet funcionando
- `.env` com `EXPO_PUBLIC_API_URL` apontando para a API correta

## Passo a passo mais simples

### 1. Instalar dependencias

```bash
npm install
```

Esse comando baixa os pacotes do projeto.

### 2. Fazer login no Expo

```bash
npx eas login
```

Esse comando autentica sua conta Expo para permitir o build na nuvem.

### 3. Gerar o APK

```bash
npx eas build -p android --profile preview
```

Esse comando:
- usa a plataforma Android
- usa o perfil `preview`
- gera um arquivo `.apk`

## O que acontece depois

Ao final do build, o Expo/EAS entrega um link para download do APK.

Voce pode:
- baixar o APK no computador e mandar para o celular
- abrir o link direto no celular
- instalar o APK manualmente no Android

## Como instalar no celular

1. Baixe o APK.
2. Envie o arquivo para o celular.
3. Abra o APK no Android.
4. Permita instalar apps de fonte externa, se o aparelho pedir.
5. Finalize a instalacao.

## Comando de producao

Se voce quiser gerar o pacote para loja em vez de um APK simples:

```bash
npx eas build -p android --profile production
```

Esse comando gera um `.aab`, que e o formato usado na Play Store.

## Quando gerar outro APK

Gere um novo APK sempre que voce mudar:

- codigo do app
- `EXPO_PUBLIC_API_URL`
- permissoes/configuracoes nativas
- icones, splash ou configuracoes do `app.json`

## Alternativa para instalar direto no dispositivo

Se a ideia for apenas testar no Android conectado por USB, sem gerar um APK final:

```bash
npx expo run:android --device
```

Esse comando instala e abre o app diretamente no aparelho conectado.

Importante:
- esse caminho e util para testes
- ele nao e o fluxo mais simples para distribuir um APK
- para compartilhar o app com outras pessoas, prefira o `eas build`

## Checklist rapido

Antes de buildar:

- `npm install`
- backend funcionando
- `.env` correto
- `EXPO_PUBLIC_API_URL` apontando para a API certa
- login no Expo feito

Para gerar o APK:

```bash
npx eas build -p android --profile preview
```
## Como buildar localmente no dispositivo

```bash
cd C:\Users\Lar\Desktop\UISyncMobile
npx expo prebuild

cd android
.\gradlew assembleRelease
```