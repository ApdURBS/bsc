# API — Controle BSC APD/UPD (v0.5.0)

Base: `/api` · JSON · autenticação por cookie `bsc_token` (httpOnly, JWT com sessão revogável) ·
requisições que alteram dados exigem o cabeçalho `X-CSRF-Token` com o valor do cookie `bsc_csrf` (o frontend já faz isso).
Erros: `{ "erro": "mensagem", "detalhes": [...] }` (400 dados/regra, 401 sessão, 403 permissão, 404, 409 conflito, 422 validação).
Listas paginadas: `?page=1&pageSize=25` → `{ itens, total, page, pageSize }`.

| Método e rota | Permissão | Descrição |
|---|---|---|
| POST `/auth/login` · `/auth/logout` · GET `/auth/me` | — / sessão | Login (bloqueio após 5 falhas), logout, usuário atual e permissões |
| POST `/auth/change-password` · `/auth/forgot-password` · `/auth/reset-password` | sessão / — | Troca e recuperação de senha (link de uso único, 1 h) |
| GET/POST `/users` · PATCH `/users/:id` | users.view/create/update | Usuários (senha nunca retorna; hash bcrypt) |
| GET `/roles` · `/roles/permissions` · POST `/roles` · PUT `/roles/:id` | roles.manage | Perfis e permissões |
| GET `/frentes` `/status` `/confidencialidades` `/tipos-movimentacao` `/tipos-documento` `/tipos-ocorrencia` | autenticado | Cadastros (`?todos=1` inclui inativos). POST/PATCH exigem `settings.manage`; nunca há exclusão física |
| GET `/users/pessoas` | projects.view | Usuários ativos marcados “Pertence à APD/UPD” (Dono, Scrum Master, equipe, responsáveis) |
| GET `/projects/next-code?frenteId=` · GET `/projects/code-available?frenteId=&sequencia=` | projects.create | Sugestão do próximo código e verificação de disponibilidade |
| GET `/projects` | projects.view | Filtros: `busca, frenteId, statusId, scrumMasterId (em alguma etapa), donoId, responsavelId (participa: dono ou responsável/Scrum/equipe de etapa), confidencialidadeId, situacaoPrazo, card, prazoDe, prazoAte, movDe, movAte, semMovimentacaoDias, meus, ativo` · ordenação `sort=codigo\|nome\|frente\|status\|prazo\|execucao\|ultimaMovimentacao&dir=asc\|desc` |
| GET `/projects/next-code?frenteId=` | projects.create | Prévia do próximo código |
| POST `/projects` · GET/PATCH/DELETE `/projects/:id` | projects.* | Criação gera o código `FRENTE_N` de forma atômica. DELETE é lógico (inativa) |
| GET `/projects/:id/timeline` · `/projects/:id/audit` | projects.view / audit.project_history | Linha do tempo completa · histórico de alterações do projeto |
| GET/POST `/projects/:id/stages` · GET `/projects/:id/stages/next-letter` | stages.* | Etapas (letra sugerida; alterar exige `stages.custom_letter`). Corpo: `nome, responsavelId, scrumMasterId, membros[] (ids de usuários), tags[], statusId, dataInicio, dataPrevista, dataConclusaoReal, peso, pastaCaminho`. Datas/Scrum/equipe/tags do projeto são derivados |
| GET `/stages` · GET/PATCH `/stages/:id` · GET/POST `/stages/:id/activities` | stages.* / activities.* | Etapas (global) e atividades da etapa |
| GET `/activities` · PATCH `/activities/:id` | activities.* | Atividades (global) |
| GET/POST `/movements` · GET `/movements/usuarios` | movements.* | Movimentações — **somente inserção** (sem PUT/DELETE; o banco bloqueia UPDATE/DELETE) |
| GET `/audit` · `/audit/facets` | audit.view | Log completo de auditoria (imutável) |
| GET `/dashboard/summary` | dashboard.view | Cards, projetos por frente, faixas de prazo e atividades recentes |
| GET `/dashboard/prazos` · `/dashboard/por-scrum` · `/dashboard/por-equipe` · `/dashboard/indicadores` | dashboard.view | Painel de prazos (projetos e etapas por faixa, listas de atenção), indicadores por Scrum Master e por pessoa, indicadores gerenciais |
| GET `/dashboard/inatividade?dias=` | dashboard.view | Projetos sem movimentação (último usuário, dias parado, Scrum Masters, dono) |
| GET `/dashboard/movimentacoes-mes?meses=&projetoId=&frenteId=&usuarioId=&scrumMasterId=&membroId=` | dashboard.view | Movimentações por mês (série completa, meses sem registro = 0) |
| GET `/notifications?naoLidas=1&page=` · GET `/notifications/count` · POST `/notifications/:id/read` · POST `/notifications/read-all` | autenticado | Central de notificações do usuário logado |
| GET/POST `/alerts` · PATCH/DELETE `/alerts/:id` · POST `/alerts/run` | settings.manage | Regras de alerta (tipo, antecedência, frequência, destinatários) e geração imediata |
| GET `/documents` · POST `/documents` (multipart: `arquivo`, `projetoId`, `nome`, `categoria`, `tipoId`, `etapaId`, `atividadeId`, `ocorrenciaId`, `responsavelId`, `caminhoRede`, `observacao`) | documents.view / documents.create | Lista paginada (`projetoId, etapaId, atividadeId, ocorrenciaId, tipoId, categoria, busca`). Sem arquivo, exige `caminhoRede` (referência) |
| GET `/documents/:id` · PATCH `/documents/:id` · DELETE `/documents/:id` | documents.view / create / **manage** | Detalhe com versões · metadados · exclusão lógica (auditada) |
| POST `/documents/:id/versions` (multipart `arquivo`, `observacao`) · GET `/documents/:id/download?versao=&inline=1` | documents.create / view | Nova versão · download (`inline=1` só para PDF/PNG/JPEG/GIF/WebP) |
| GET/POST `/occurrences` · GET/PATCH `/occurrences/:id` | occurrences.view / manage | Filtros `projetoId, etapaId, responsavelId, tipoId, status, severidade, aberta, vencida, busca`. Sem DELETE (use status `CANCELADA`) |
| GET `/reports` · GET `/reports/:id?formato=json\|xlsx\|csv\|pdf` | reports.view (`audit.view` p/ `auditoria`) | Catálogo e geração. Filtros: `frenteId, statusId, donoId, projetoId, userId, dias, modulo, de, ate` |
| GET `/search?q=` | projects.view | Busca global (projetos, etapas, atividades) |
| GET `/settings/public` · GET/PUT `/settings/:chave` | autenticado / settings.manage | Limites de prazo, inatividade e sessão |

`card` = `total | vigentes | andamento | finalizados | atrasados | bloqueados | suspensos | semMovimentacao` — é o **mesmo** filtro usado
para contar os cards do dashboard, garantindo que o número do card e a lista aberta ao clicar sempre coincidam.

### Importação (permissão `import.manage`)

| Endpoint | Descrição |
|---|---|
| POST `/import/preview` (multipart `arquivo`, `aba`) | Lê a planilha, valida e grava a prévia (status PREVIA) |
| GET `/import` · GET `/import/:id` · GET `/import/:id/linhas?estado=&page=` · GET `/import/:id/problemas.csv` | Histórico, resumo, linhas e problemas |
| POST `/import/:id/confirm` (`{pessoas:{nome:userId\|null}}`) · POST `/import/:id/cancel` | Grava em uma única transação · cancela |

### Documentação interativa e Power BI

`GET /api/openapi.json` (OpenAPI 3) e `GET /api/docs` (Swagger UI) são públicos. Views `bi_*` para Power BI: `docs/POWERBI.md`. Versão atual: 0.6.0.
