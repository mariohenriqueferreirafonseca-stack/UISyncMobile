# Como enviar o projeto para Git e GitHub

Este guia mostra como versionar o app com Git e enviar para um repositorio no GitHub.

## Antes de subir

Revise se voce realmente quer enviar estes tipos de arquivo:

- `.env`
- arquivos de fallback em `server/data/`
- imagens locais
- planilhas e arquivos temporarios

Se houver dado sensivel, remova ou ajuste o `.gitignore` antes do commit.

## 1. Configurar seu nome e email no Git

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seuemail@exemplo.com"
```

O que esses comandos fazem:
- definem quem sera o autor dos commits na sua maquina

## 2. Inicializar o repositorio Git

Se o projeto ainda nao tiver Git:

```bash
git init
```

O que esse comando faz:
- cria a pasta oculta `.git`
- passa a permitir commits e historico local

## 3. Ver o estado atual do projeto

```bash
git status
```

O que esse comando faz:
- mostra arquivos novos, alterados e removidos
- ajuda a revisar o que vai entrar no commit

## 4. Adicionar os arquivos ao commit

```bash
git add .
```

O que esse comando faz:
- coloca todos os arquivos alterados na area de preparo do commit

Se quiser adicionar arquivos aos poucos:

```bash
git add README.md
git add docs/BUILD.md
git add docs/GitHub.md
```

## 5. Criar o commit

```bash
git commit -m "Documenta o projeto e adiciona guias de build e GitHub"
```

O que esse comando faz:
- cria um ponto no historico com os arquivos preparados
- salva a mensagem que explica o que mudou

## 6. Garantir que a branch principal se chama `main`

```bash
git branch -M main
```

O que esse comando faz:
- renomeia a branch atual para `main`

## 7. Criar o repositorio no GitHub

Voce pode fazer isso de duas formas.

### Opcao A: pelo site

1. Entre no GitHub.
2. Clique em `New repository`.
3. Escolha o nome do repositorio.
4. Crie o repositorio vazio.

### Opcao B: pela CLI do GitHub

```bash
gh repo create UISyncMobile --public
```

O que esse comando faz:
- cria o repositorio no GitHub pela linha de comando

## 8. Conectar o projeto local ao GitHub

```bash
git remote add origin https://github.com/SEU_USUARIO/UISyncMobile.git
```

O que esse comando faz:
- cadastra o endereco do repositorio remoto com o nome `origin`

Para conferir:

```bash
git remote -v
```

## 9. Enviar o projeto para o GitHub

```bash
git push -u origin main
```

O que esse comando faz:
- envia a branch `main` para o GitHub
- cria o vinculo padrao para os proximos `git push`

## Fluxo normal das proximas alteracoes

Depois da primeira subida, o fluxo comum e:

```bash
git status
git add .
git commit -m "Sua mensagem"
git push
```

O que cada um faz:
- `git status`: mostra o que mudou
- `git add .`: prepara as alteracoes
- `git commit -m "..."`: grava no historico local
- `git push`: envia para o GitHub

## Se o repositorio remoto ja tiver arquivos

Se o GitHub foi criado com `README`, `LICENSE` ou `.gitignore`, puxe antes de subir:

```bash
git pull --rebase origin main
git push -u origin main
```

O que esses comandos fazem:
- `git pull --rebase origin main`: traz o historico remoto sem criar merge desnecessario
- `git push -u origin main`: envia seu trabalho ja alinhado com o remoto

## Se voce estiver no meio de um rebase

Antes de tentar subir, confira:

```bash
git status
```

Se aparecer mensagem como `rebase in progress`, resolva isso antes do `push`.

## Quando usar `--force-with-lease`

Use apenas se voce reescreveu historico com rebase e sabe o que esta fazendo:

```bash
git push --force-with-lease origin main
```

Esse comando:
- atualiza o remoto com o novo historico
- e mais seguro que `--force`, porque verifica se o remoto nao mudou desde sua ultima leitura

## Checklist final

Antes do push:

- `git status`
- conferir se nao vai subir segredo no `.env`
- conferir se nao vai subir cache, build ou lixo local
- revisar a mensagem do commit

Comandos principais:

```bash
git add .
git commit -m "Sua mensagem"
git push -u origin main
```
