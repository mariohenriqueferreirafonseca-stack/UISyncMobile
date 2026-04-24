# Publicar o projeto no GitHub

Este guia mostra os comandos necessarios para colocar o projeto no GitHub e explica o que cada um faz.

## Antes de comecar

- tenha o Git instalado
- tenha uma conta no GitHub
- abra o terminal na raiz do projeto

Exemplo:

```bash
cd C:\Users\Lar\Desktop\UISyncMobile
```

Esse comando entra na pasta do projeto antes de executar os passos abaixo.

## 1. Conferir se o Git esta disponivel

```bash
git --version
```

Mostra a versao instalada do Git. Se esse comando falhar, o Git ainda nao esta instalado na maquina.

## 2. Conferir o estado atual do repositorio

```bash
git status
```

Mostra:

- em qual branch voce esta
- se existem arquivos modificados
- se ha arquivos prontos para commit

## 3. Configurar nome e email do Git na maquina

Use estes comandos na primeira vez que for publicar algo da maquina:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seuemail@dominio.com"
```

Eles definem a identidade que vai aparecer nos commits.

## 4. Inicializar o repositorio Git

Use este comando apenas se a pasta ainda nao for um repositorio Git:

```bash
git init
```

Ele cria a pasta `.git` e transforma o projeto em um repositorio local.

## 5. Garantir que a branch principal se chame `main`

```bash
git branch -M main
```

Renomeia a branch atual para `main`. Isso ajuda a manter o padrao mais comum de branch principal no GitHub.

## 6. Conferir se arquivos sensiveis estao ignorados

```bash
git check-ignore -v .env node_modules .expo
```

Mostra se esses caminhos estao sendo ignorados pelo `.gitignore`. E importante confirmar isso antes do `git add .`, especialmente por causa do `.env`.

## 7. Adicionar os arquivos ao commit

```bash
git add .
```

Coloca todos os arquivos novos e alterados na area de preparo do proximo commit.

## 8. Conferir o que entrou no commit

```bash
git status
```

Agora esse comando serve para revisar o que foi preparado antes de gravar o commit.

## 9. Criar o commit inicial

```bash
git commit -m "Publica UISyncMobile no GitHub"
```

Cria um commit com a foto atual do projeto e a mensagem informada.

## 10. Criar o repositorio no GitHub

Voce tem duas formas comuns de fazer isso.

### Opcao A. Criar no site do GitHub

1. Acesse o GitHub.
2. Clique em `New repository`.
3. Crie o repositorio, de preferencia vazio.

Importante:

- nao marque README
- nao marque `.gitignore`
- nao marque license

Se o repositorio remoto nascer vazio, o primeiro `push` fica mais simples.

Depois de criar no site, conecte o repositorio local ao remoto:

```bash
git remote add origin https://github.com/SEU_USUARIO/UISyncMobile.git
```

Esse comando cadastra o remoto chamado `origin`.

Se voce preferir SSH:

```bash
git remote add origin git@github.com:SEU_USUARIO/UISyncMobile.git
```

Esse comando faz a mesma ligacao, mas usando SSH em vez de HTTPS.

## 11. Conferir se o remoto foi configurado

```bash
git remote -v
```

Lista os remotos configurados e suas URLs de `fetch` e `push`.

## 12. Enviar a branch principal para o GitHub

```bash
git push -u origin main
```

Esse comando:

- envia a branch `main` para o remoto `origin`
- cria a branch remota se ela ainda nao existir
- usa `-u` para deixar `origin/main` como branch de acompanhamento

Depois disso, os proximos envios podem ser feitos apenas com `git push`.

## Opcao B. Criar o repositorio usando GitHub CLI

Se voce usa `gh`, pode fazer tudo de uma vez:

```bash
gh auth login
gh repo create UISyncMobile --private --source=. --remote=origin --push
```

O que cada comando faz:

- `gh auth login`: autentica sua conta do GitHub na maquina
- `gh repo create ...`: cria o repositorio no GitHub, conecta o remoto `origin` e faz o primeiro `push`

Se quiser um repositorio publico, troque `--private` por `--public`.

## Proximas atualizacoes depois do primeiro envio

Depois que o projeto ja estiver no GitHub, o fluxo normal passa a ser:

```bash
git status
git add .
git commit -m "Descreva aqui a alteracao"
git push
```

O que cada comando faz:

- `git status`: mostra o que mudou
- `git add .`: prepara as alteracoes
- `git commit -m "..."`: grava um novo commit
- `git push`: envia os commits pendentes para o GitHub

## Comandos uteis de conferencia

```bash
git log --oneline -n 5
git branch
git remote -v
```

Eles ajudam a conferir:

- os ultimos commits
- a branch atual
- o remoto configurado

## Se o remoto ja existir e voce precisar trocar a URL

```bash
git remote set-url origin https://github.com/SEU_USUARIO/UISyncMobile.git
```

Atualiza a URL do remoto `origin` sem precisar remover e adicionar de novo.

## Se o primeiro `push` falhar porque o repositorio remoto nao esta vazio

Isso costuma acontecer quando o repositorio foi criado no GitHub com README, `.gitignore` ou license.

```bash
git pull --rebase origin main
git push -u origin main
```

O primeiro comando traz o historico remoto e reaplica seus commits locais por cima. O segundo tenta o envio novamente.

## Cuidados importantes

- nao publique o arquivo `.env`
- nao publique `node_modules`
- confira o `git status` antes de cada commit
- revise a URL do remoto com `git remote -v`
- se estiver usando HTTPS, o GitHub pode pedir token em vez de senha
