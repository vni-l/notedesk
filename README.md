# NoteDesk

Aplicativo desktop local para escrever páginas. A interface tem uma lista de páginas salvas na barra lateral e uma área de edição com título, conteúdo e contador de palavras e caracteres.

## Stack

- Tauri 2 e Rust
- TypeScript, HTML e CSS, sem framework frontend
- Vite e pnpm

## Pré-requisitos

- Rust e Cargo
- Node.js e pnpm
- Dependências nativas necessárias para compilar Tauri 2 no sistema operacional utilizado; no Linux, consulte os pré-requisitos oficiais do Tauri.

## Preparar e executar

Na raiz do projeto, instale as dependências frontend:

```bash
pnpm install
```

Execute o aplicativo em desenvolvimento:

```bash
pnpm tauri dev
```

Gere a versão de distribuição configurada para o projeto:

```bash
pnpm tauri build
```

## Estado atual

Cada página é um arquivo Markdown `.md` independente, com o título na primeira linha e o texto nas linhas seguintes. O app salva automaticamente após uma breve pausa na digitação, ao sair de um campo, ao trocar de página e antes de fechar a janela. Clique em uma página na barra lateral para abri-la. **Nova página** inicia outra página. O ícone de engrenagem no canto inferior esquerdo permite escolher o tema claro ou escuro.

Os arquivos ficam na pasta de dados do aplicativo, dentro de `com.local.notedesk/notes/`. No Linux, normalmente em `$XDG_DATA_HOME/com.local.notedesk/notes/` ou `$HOME/.local/share/com.local.notedesk/notes/`; no Windows, em `%APPDATA%\com.local.notedesk\notes\`. O nome do arquivo é um identificador estável, como `abc-123.md`, para que mudar o título não quebre a referência.

Páginas JSON de versões anteriores são lidas da pasta antiga `com.local.bloco-de-notas/notes/`. Ao editar uma delas, o NoteDesk grava a versão Markdown na pasta nova e preserva o arquivo antigo como cópia.
