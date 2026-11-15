# Site SolidLynx

Site estático de [solidlynx.pt](https://solidlynx.pt), feito com [Astro](https://astro.build) e publicado no GitHub Pages a cada push para `main` (`.github/workflows/deploy.yml`).

| Comando           | O que faz                                  |
| :---------------- | :----------------------------------------- |
| `npm install`     | Instala as dependências                    |
| `npm run dev`     | Servidor local em `localhost:4321`         |
| `npm run build`   | Gera o site em `./dist/`                   |
| `npm run preview` | Pré-visualiza o site gerado                |

- Dados da empresa (email, NIF, morada) e versões dos documentos legais: `src/data/empresa.ts`.
- Ao alterar os Termos ou a Privacidade, suba a versão e a data nesse ficheiro.
