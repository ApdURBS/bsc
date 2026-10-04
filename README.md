# Controle BSC — APD/UPD · URBS

Sistema web para controle e gestão de projetos do BSC (Frente → Projeto → Etapa → Atividade → Movimentação), substituindo a planilha Excel.

**Versão 0.6.0 — Fases 1 a 6 entregues** (banco, autenticação, perfis e permissões, cadastros, projetos, etapas, atividades, prazos, movimentações, timeline, auditoria, dashboards, alertas, documentos, ocorrências, relatórios, importação da planilha, API documentada e views para Power BI).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Recharts + TanStack Query |
| Backend | Node.js 22 + TypeScript + Express + Zod (validação) |
| Banco | PostgreSQL 16 · ORM **Drizzle** (migrações SQL versionadas em `backend/drizzle`) |
| Segurança | bcrypt, JWT em cookie httpOnly com sessão revogável no banco, CSRF (double-submit), Helmet/CSP, rate limit no login, bloqueio após 5 falhas, consultas parametrizadas (sem SQL Injection), React (sem XSS por padrão) |

> O requisito dizia “Prisma ou equivalente”. Usei **Drizzle** porque o download do motor do Prisma estava bloqueado no ambiente em que o sistema foi construído e testado; Drizzle é equivalente (TypeScript, tipado, PostgreSQL) e deixou eu validar tudo de ponta a ponta.

## Como rodar no seu computador (Windows)

Pré-requisito: apenas **Node.js 20+**. O banco PostgreSQL é escolhido automaticamente: Docker Desktop (se estiver rodando), um PostgreSQL já ativo na porta 5432, ou — se você não tiver nenhum — um **banco local embutido** (`npm run banco:local`, dados em `.dados-pg`, usuário/senha/banco `bsc`), que fica numa janela própria que deve permanecer aberta.

Atalho: dê dois cliques em **`INICIAR-Windows.bat`**. Ou manualmente, na pasta do projeto:

```bash
copy backend\.env.example backend\.env      # ajuste se necessário
npm run instalar        # instala dependências (backend e frontend)
npm run banco           # sobe o PostgreSQL (docker compose) — sem Docker: npm run banco:local
npm run preparar        # cria as tabelas e os cadastros básicos + usuário admin
npm run demo            # (opcional) carrega 10 projetos de demonstração
npm run api             # terminal 1 → API em http://localhost:3000
npm run web             # terminal 2 → sistema em http://localhost:5173
```

A API cria as tabelas e os cadastros básicos sozinha ao iniciar; se o PostgreSQL estiver fora do ar, ela informa o motivo no terminal.

Primeiro acesso: usuário **`admin`**, senha inicial **`Trocar@123`** — o sistema exige a troca imediatamente.
Logo da URBS: `frontend/public/logoUrbs.svg` (se o arquivo for removido, aparece a marca textual “URBS”).

Testes automatizados (23 cenários de API, incluindo os critérios de aceitação 1–16 e a política de confidencialidade): `npm run test`
(usa o banco `bsc_test`; crie-o com `createdb bsc_test` ou ajuste `TEST_DATABASE_URL`).

## Publicação online

Um único serviço (a API serve o frontend compilado). Com Docker:

```bash
set JWT_SECRET=<gere com: openssl rand -hex 48>
docker compose --profile app up -d --build
```

Em produção: HTTPS obrigatório (cookies `Secure`), `JWT_SECRET` forte (o sistema **se recusa a iniciar** com segredo fraco), `APP_URL` com o endereço público (usado no link de recuperação de senha), SMTP configurado (`SMTP_*`; sem SMTP o link aparece apenas no log do servidor) e backup diário do PostgreSQL.
`Dockerfile` e `docker-compose.yml` foram escritos mas **não puderam ser executados no ambiente de construção** — valide no primeiro deploy.

## O que já funciona

- **Login** institucional, troca obrigatória de senha, recuperação de senha, logout, expiração de sessão (configurável), bloqueio por tentativas.
- **Usuários, perfis e permissões** granulares. Perfis nativos: ADMINISTRADOR, OPERADOR, CONSULTA; novos perfis podem ser criados com qualquer combinação de permissões. O menu e os botões respeitam as permissões, e a API valida cada uma.
- **Cadastros configuráveis** (Configurações): frentes (código automático), status (com classificação para identificar situações críticas), confidencialidade, tipos de movimentação/documento/ocorrência, limites de prazo e de inatividade. Nada é excluído — apenas desativado.
- **Projetos**: código `FRENTE_N` gerado automaticamente e sem colisão mesmo com usuários simultâneos (o `2_2` excluído nunca é reutilizado), dono, confidencialidade, pasta de rede (guardada como referência) e campos extras (`campos_extras`) reservados para Direcionador/Ação Tática.
- **Etapas** com letra sugerida (A, B, C… até AA, AB…; alterar exige permissão), **atividades**, responsáveis, prazos e status.
- **Prazos automáticos**: dias restantes, dias em atraso, % do prazo consumido e situação 🟢 Normal / 🟡 Atenção / 🟠 Crítico / 🔴 Vencido, calculados na hora (nada digitado à mão).
- **Execução automática**: etapa = atividades concluídas ÷ atividades (com peso); projeto = etapas concluídas ÷ etapas (com peso). Canceladas saem do cálculo.
- **Movimentações**: apenas inserção — sem edição/exclusão na API **e bloqueio por trigger no PostgreSQL**. Atualizam a “última movimentação” (que nunca retrocede com lançamentos retroativos). Timeline com filtros (período, usuário, etapa, tipo) e opção de incluir eventos do sistema.
- **Auditoria** automática e imutável (trigger): usuário, data/hora, módulo, registro, campo, valor anterior/novo e IP, em todas as alterações relevantes, incluindo login/logout/falha, criação de usuário e mudança de permissões. Administrador vê o log completo; Operador vê o histórico do projeto.
- **Dashboard**: 8 cards clicáveis (a lista aberta mostra exatamente o número do card), projetos por frente (clicável), faixas de prazo, “Meus projetos” e atividades recentes. **Busca global** no topo. **Filtros combinados**, ordenação, paginação, colunas configuráveis e exportação CSV na lista de projetos.

## Confidencialidade (regra definida)

| Nível do projeto | Quem enxerga |
|---|---|
| **Livre** | Qualquer usuário, inclusive o perfil **CONVIDADO** |
| **Interno URBS** (padrão de novos projetos) | Todos os usuários do sistema, **exceto** o perfil CONVIDADO |
| **Interno APD** | Apenas usuários marcados como **“Pertence à APD/UPD”** (e o Administrador) |

Aplica-se a listas, detalhe, etapas, atividades, movimentações, timeline, histórico, busca global e Dashboard; um projeto fora do alcance responde “não encontrado”. Ninguém pode atribuir a um projeto um nível que o próprio usuário não enxergue. Configure em **Usuários** (marca “Pertence à APD/UPD”), em **Perfis** (marca “Perfil de convidado”) e em **Configurações → Confidencialidade**.
Se você já tinha o sistema instalado, os níveis antigos são convertidos automaticamente (Público interno → Livre, Restrito → Interno URBS, Confidencial → Interno APD). **Atenção:** usuários que já existiam começam sem a marca APD/UPD (exceto administradores) — marque-os em Usuários.

## Decisões para a importação (Fase 6)

Mapeamento aprovado: `LIVRE` → Livre; `INTERNO URBS` → Interno URBS; `INTERNO APD` → Interno APD (`INTERNO` sem complemento → Interno URBS, com aviso na prévia). A coluna “Atividade” da planilha é importada **apenas como nome da etapa**.

## Pessoas e códigos

- **Scrum Master, Equipe, Tags e Datas ficam nas etapas**, não no projeto. O projeto mostra apenas a consolidação (Scrum Masters, equipe e tags das etapas; início = menor início e previsão = maior previsão entre as etapas ativas e não canceladas, recalculados a cada alteração). Não existe mais o cadastro de Equipes: a equipe de uma etapa são pessoas (usuários da APD/UPD).
- **Não existe mais cadastro de Colaboradores**: usuários e colaboradores são a mesma coisa. Dono do projeto e Responsável/Scrum Master/equipe das etapas e responsáveis por atividades são escolhidos entre os **usuários ativos marcados “Pertence à APD/UPD”** (Usuários → editar → marcar).
- **Código do projeto**: ao criar, o sistema sugere o próximo número da frente (ex.: `2_4`), mas você pode digitar outro número (ex.: `2_20`). Códigos já existentes — inclusive de projetos excluídos — são recusados. Depois de criado, o código não muda.
- Se você já tinha dados da versão anterior, a atualização converte os colaboradores em usuários (pelo vínculo, e-mail ou nome iguais); campos sem correspondência ficam vazios para você preencher.

## Fase 4 — Dashboards, prazos e alertas

- **Dashboard em abas**: *Visão geral* (cards clicáveis, projetos por frente, projetos sem movimentação), *Prazos* (🟢 Normal · 🟡 Atenção · 🟠 Crítico · 🔴 Vencido, vencimentos por período para projetos e etapas, etapas atrasadas e próximos vencimentos), *Scrum Master* (gráfico e tabela clicáveis), *Equipe* (projetos, etapas, atividades, atrasos, finalizações e pendências por pessoa) e *Indicadores* (totais, percentuais, prazo médio, tempo médio de conclusão e movimentações por mês com filtros).
- **Notificações**: o sino do cabeçalho mostra as não lidas, abre as mais recentes e permite marcar como lida; a lista completa fica em `/notificacoes`. Os links de Prazos e Notificações saíram do menu lateral por já estarem contemplados no Dashboard e no sino.
- **Alertas configuráveis** (Configurações → Alertas): tipo (prazo próximo, atraso, sem movimentação, pessoa com etapas atrasadas), antecedência, frequência (diária, semanal ou única) e destinatários (participantes e/ou pessoas escolhidas). São verificados ao iniciar a API e a cada hora; o mesmo aviso não se repete dentro da frequência, e quem não pode ver um projeto (confidencialidade) não recebe aviso dele. Há o botão *Gerar agora*.
- A Equipe de uma etapa são pessoas: os indicadores de equipe consideram responsável, Scrum Master e membros das etapas.

## Fase 5 — Documentos, ocorrências e relatórios

- **Documentos** (aba *Documentos* do projeto; lista global em `/documentos`): upload, download, visualização (PDF e imagens abrem no navegador), **versões** com histórico (cada nova versão preserva a anterior, com hash SHA-256), edição de dados, categoria (Relatórios, Documentos, Evidências, Outros), vínculo opcional a etapa e atividade e **caminho de pasta de rede** (guardado só como referência, com botão *Copiar*). Excluir exige a permissão *Gerenciar e excluir documentos*; a exclusão é lógica e auditada — os arquivos e versões permanecem no servidor.
- Limite de **25 MB** por arquivo (`MAX_UPLOAD_MB`). Extensões executáveis (`.exe`, `.bat`, `.cmd`, `.js`, `.ps1`, `.msi`, `.vbs`, `.jar`, `.sh`, `.dll`…) são recusadas. Os arquivos ficam em `backend/storage` (`UPLOAD_DIR`): **inclua essa pasta no backup junto com o banco**.
- Documentos seguem a confidencialidade do projeto: quem não enxerga o projeto não vê, nem baixa, seus documentos.
- **Ocorrências** (aba *Ocorrências* do projeto; lista global em `/ocorrencias`): título, descrição, severidade (Baixa a Crítica), status (Aberta → Em tratamento → Resolvida / Cancelada), responsável, prazo e data de resolução (preenchida automaticamente ao resolver; a solução aplicada é obrigatória), vínculo a etapa/atividade e **anexos** (são documentos). Não há exclusão — use *Cancelada*. Toda alteração é auditada.
- **Relatórios** (menu *Relatórios*): Geral, Vigentes, Atrasados, A vencer, por Frente, por Scrum Master, por Equipe, Etapas atrasadas, Sem movimentação, Histórico de movimentações e Auditoria (só para quem vê o log completo). Prévia na tela e exportação em **Excel**, **CSV** (separador `;`, abre direto no Excel em português) e **PDF** com logo URBS, nome do sistema, nome do relatório, data/hora, usuário, cabeçalho, rodapé e “Página X de Y”. Os relatórios respeitam a confidencialidade. Limites por exportação: PDF 50 mil linhas, Excel/CSV 200 mil.
- Importante: após atualizar, rode `npm install` (novas bibliotecas) — o `INICIAR-Windows.bat` já faz isso.

## Fase 6 — Importação, API documentada e Power BI

- **Importar dados** (menu *Importar dados*, permissão `import.manage`): envie o `.xlsx`/`.xlsm`/`.csv` (escolha a aba, se houver mais de uma). A **prévia** mostra registros válidos, duplicados e com erro (campos obrigatórios, código inválido, data inválida, status/confidencialidade não reconhecidos), com filtro por tipo e download dos problemas em CSV. Nada é gravado até **Confirmar**; é possível **Cancelar**.
- **Pessoas**: nomes da planilha são casados com usuários ativos “Pertence à APD/UPD”; você ajusta o vínculo na prévia (ou deixa sem vínculo).
- **Regras**: a coluna “Atividade” vira o nome da etapa; cada data preenchida nas colunas de data vira **uma movimentação** (tipo Atualização, marcada como importada, com linha de origem); “Individual” e “Equipe Completa” viram tags da etapa; a pessoa da coluna Equipe vira responsável e membro; o status do projeto sem linha própria é derivado das etapas; a confidencialidade do projeto é a mais restritiva entre as linhas; datas de movimentação futuras são ignoradas (aviso).
- **Linhas com ERRO são ignoradas.** Corrija a planilha e importe de novo: a importação é **idempotente** (projetos/etapas existentes são mantidos e só movimentações novas entram).
- **Rastreabilidade**: tabela `importacoes` (arquivo, hash, resumo, resultado) e vínculo `importacao_id` em projetos, etapas e movimentações, além da auditoria.
- **API documentada**: `/api/docs` (Swagger UI, local, sem internet) e `/api/openapi.json`.
- **Power BI**: views `bi_*` somente leitura — veja `docs/POWERBI.md`.
- Após atualizar, rode `npm install` (o `INICIAR-Windows.bat` já faz).

## Estrutura

```
backend/   API (src/routes, src/lib), schema em src/db/schema.ts, migrações em drizzle/, testes em tests/
frontend/  React (src/pages, src/components)
docs/      API.md, PLANILHA_MAPEAMENTO.md, POWERBI.md
```
