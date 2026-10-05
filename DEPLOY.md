# Deploy em produção — Vercel + Render + Supabase

Este documento é o passo a passo para publicar o Controle BSC na arquitetura:

```
Vercel (frontend React/Vite)  →  HTTPS  →  Render (API Node/Express)  →  Supabase (PostgreSQL)
```

Pré-requisito: o código precisa estar em um repositório Git (GitHub), pois Vercel e Render fazem deploy a partir dele.

## 1. GitHub

```bash
git init
git add .
git status   # confirme que backend/.env, node_modules/, .dados-pg/ e backend/storage/ NÃO aparecem
git commit -m "Versão 0.6.0 preparada para produção"
```

Crie o repositório no GitHub e faça o push (`git remote add origin ...`, `git push -u origin main`).

## 2. Supabase (banco de dados)

1. Crie um projeto em [supabase.com](https://supabase.com). Guarde a senha do banco gerada na criação.
2. Em **Project Settings → Database**, copie a *Connection string* (modo *URI*). Prefira a do **connection pooling** (porta `6543`, modo *transaction*) para a API — conexões diretas (porta `5432`) são mais adequadas para ferramentas como o Power BI em modo *session*.
3. Monte a `DATABASE_URL` incluindo SSL, por exemplo:
   `postgresql://postgres.<ref>:<senha>@<host-do-pooler>:6543/postgres?sslmode=require`
4. Rode as migrations contra esse banco (uma única vez, a partir da sua máquina ou de um job de deploy):
   ```bash
   cd backend
   DATABASE_URL="<connection string do Supabase>" npm run db:migrate
   DATABASE_URL="<connection string do Supabase>" npm run db:seed
   ```
   Isso cria as tabelas, triggers, views `bi_*` e o usuário administrador inicial (`admin` / `Trocar@123` — troque assim que entrar).
5. (Opcional, para Power BI) No **SQL Editor** do Supabase, rode o `CREATE ROLE bi_leitura ...` descrito em `docs/POWERBI.md`.
6. Backup: o Supabase já faz backup automático diário nos planos pagos; confirme a política no painel do projeto.

## 3. Render (backend)

1. Crie um **Web Service** apontando para o repositório GitHub, diretório raiz `backend/`.
2. Build command: `npm install --include=dev && npm run build`
   (o `--include=dev` é necessário porque, com `NODE_ENV=production` definido, o Render pula `devDependencies` por padrão — e o build precisa do `typescript` e dos `@types/*`, que estão em `devDependencies`)
3. Start command: `npm start`
4. Health check path: `/api/health`
5. Variáveis de ambiente (Render → Environment):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | connection string do Supabase (com `sslmode=require`) |
   | `JWT_SECRET` | gerar com `openssl rand -hex 48` — **nunca** reutilizar o valor de exemplo |
   | `SESSION_HOURS` | `8` (ou o que preferir) |
   | `APP_URL` | URL pública do frontend na Vercel, ex. `https://bsc.vercel.app` |
   | `CORS_ORIGIN` | mesma URL do `APP_URL` (ou lista separada por vírgula, se houver mais de um domínio/preview) |
   | `TZ` | `America/Sao_Paulo` |
   | `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` | usados só no primeiro `db:seed`; pode deixar os padrões |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | credenciais do provedor de e-mail (obrigatório para recuperação de senha funcionar em produção) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | ver seção 5 (uploads) |
   | `MAX_UPLOAD_MB` | `25` (ou o limite desejado) |

6. O serviço já roda migrations/seed automaticamente ao iniciar (`src/server.ts`), então não é obrigatório repetir o passo 2.4 manualmente — mas não há problema em ter rodado antes.

## 4. Vercel (frontend)

1. Importe o repositório, diretório raiz `frontend/`. A Vercel detecta Vite automaticamente (build `vite build`, saída `dist/`).
2. Variável de ambiente: `VITE_API_URL` = URL pública da API no Render + `/api`, ex. `https://bsc-api.onrender.com/api`.
3. O arquivo `frontend/vercel.json` já está configurado para redirecionar qualquer rota ao `index.html` (necessário para o React Router funcionar com F5 em rotas profundas).
4. Deploy. Depois, ajuste `CORS_ORIGIN`/`APP_URL` no Render para a URL definitiva da Vercel (e refaça o deploy do backend se o domínio mudar).

## 5. Uploads de documentos (Supabase Storage)

O Render tem filesystem efêmero — arquivos gravados em disco são perdidos a cada deploy/restart. Por isso, em produção os documentos devem ir para o **Supabase Storage**:

1. No painel do Supabase, em **Storage**, crie um bucket (ex. `documentos`), **privado** (não público).
2. Em **Project Settings → API**, copie a `service_role` key (nunca a `anon` key — ela não tem permissão de escrita no bucket privado e não deve ir para o backend de qualquer forma por ter privilégios totais).
3. Configure no Render: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET=documentos`.
4. Sem essas variáveis, o backend grava em disco local (`UPLOAD_DIR`) — funciona para desenvolvimento/testes, mas o sistema **avisa no log** se isso acontecer com `NODE_ENV=production`.
5. Documentos enviados **antes** dessa migração (se o sistema já rodou em produção sem Supabase Storage) não são movidos automaticamente — avise se esse for o caso para planejarmos a migração dos arquivos existentes.

## 6. E-mail (recuperação de senha)

Configure `SMTP_HOST/PORT/USER/PASS/FROM` com um provedor real (SendGrid, Amazon SES, etc.). Sem isso, o backend **não envia e-mail** e apenas registra um aviso no log (sem o link, por segurança) — a recuperação de senha fica indisponível até configurar.

## 7. Tarefas agendadas (alertas)

Os alertas de prazo/atraso continuam rodando dentro do próprio processo da API (a cada hora, deduplicados por chave única no banco — seguro mesmo com múltiplas instâncias). Atenção: em planos do Render com "spin down" por inatividade, a instância pode dormir e o alerta não dispara até a próxima requisição acordá-la. Se isso for um problema no seu plano, considere migrar para um Render Cron Job externo chamando um endpoint dedicado — não implementado nesta etapa por ser uma mudança de arquitetura.

## 8. Domínio próprio (depois)

Quando tiver o domínio:

1. Na Vercel, adicione `app.seudominio.com` ao projeto do frontend (DNS: CNAME apontando para a Vercel).
2. No Render, adicione `api.seudominio.com` ao serviço do backend (DNS: CNAME apontando para o Render).
3. Atualize `APP_URL`/`CORS_ORIGIN` no Render e `VITE_API_URL` na Vercel para os novos domínios, e redeploy os dois.
4. Opcional: como `app.` e `api.` passam a compartilhar o mesmo domínio raiz, é possível (não obrigatório) simplificar os cookies para `SameSite=Lax` com `Domain=.seudominio.com` — mudança a avaliar separadamente, pois também exige ajuste em como o cookie é emitido.

## 9. Checklist de verificação pós-deploy

- [ ] `GET https://api.../api/health` responde `{ ok: true }`
- [ ] Login funciona e mantém a sessão (cookie enviado em requisições seguintes)
- [ ] Logout encerra a sessão
- [ ] "Esqueci minha senha" envia e-mail real
- [ ] CSRF: uma requisição de alteração sem o header `X-CSRF-Token` é rejeitada
- [ ] Upload de documento e download funcionam
- [ ] Geração de relatório em PDF e Excel funciona
- [ ] `/api/docs` exige login (Swagger não é mais público)
- [ ] Views `bi_*` acessíveis via Power BI apontando para o Supabase
- [ ] Nenhuma variável sensível está no repositório Git
