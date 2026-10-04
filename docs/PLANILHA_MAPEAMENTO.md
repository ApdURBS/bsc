# Análise da planilha atual (base da importação — implementada na Fase 6)

Arquivo analisado: `BSC_APD - 2025 (1).xlsx`, aba **2026** (cabeçalho na linha 7, dados a partir da linha 9).
Resumo: ~216 linhas, **72 projetos**, colunas fixas A–Q + **98 colunas de datas semanais** (06/01/2026 … 29/12/2026).

| Coluna da planilha | Destino no sistema | Observações |
|---|---|---|
| Mapa Estratégico (`Financeira.`, `Mercado.`, `Processos Internos`…) | `frentes` | Textos com ponto final e variações → normalizar e casar com as 6 frentes |
| Código (`1_14`) | `projetos.codigo` (+ `sequencia`) | Validar formato `frente_seq` e coerência com a frente |
| Etapa (`A`, `B`…) | `etapas.letra` | Linha **sem** letra = linha do próprio projeto (status/datas do projeto) |
| Atividade | `etapas.nome` | Na planilha cada linha é uma etapa; a coluna “Atividade” traz o título dela. **Decidido:** usar a coluna “Atividade” apenas como nome da etapa (não cria atividade). |
| D. Produto | `projetos.dono_id` (usuário da APD/UPD) | |
| Scrum master / Equipe | `etapas.scrum_master_id` / `etapa_membros` / `etapas.responsavel_id` | Ficam **na etapa** (o projeto apenas consolida). Linha do projeto sem letra não gera dado de pessoa no projeto |
| Nome do projeto | `projetos.nome` | |
| Confidencialidade (`INTERNO URBS`, `INTERNO APD`, `INTERNO`, `LIVRE`) | `confidencialidades` | **Decidido:** `LIVRE` → Livre · `INTERNO URBS` → Interno URBS · `INTERNO APD` → Interno APD · `INTERNO` (sem complemento) → Interno URBS, sinalizado na prévia da importação |
| Caminho da pasta | `projetos.pasta_caminho` / `etapas.pasta_caminho` | Guardado como referência textual |
| Status | `status` | `Em andamento`, `Finalizado`, `Suspenso`, `Aguardando`, `Bloqueado`, `Atrasado` já existem; células vazias → `Aguardando` |
| Data Início / Dt. entrega prevista / Dta. entrega real | `etapas.data_inicio` / `etapas.data_prevista` / `data_conclusao_real` | As datas do projeto são **derivadas das etapas** (menor início / maior previsão); a data real de conclusão do projeto continua própria. | Aceitar data do Excel ou texto `dd/mm/aaaa` |
| Direcionador, Cód. Ação Tática | `projetos.campos_extras` (JSON) | Não usados na tela agora; preservados para o futuro |
| **Colunas de datas (06/01/2026 …)** | `movimentacoes` | 70 células com texto (ex.: “[RENATA - 05/08/2026] Reafirmação…”). Cada célula preenchida vira **1 movimentação** com a data do cabeçalho, no projeto/etapa da linha, marcada `importada = true` |

Demais abas (`Ação Tática`, `Direcionadores`, `Planejamento estratégico1`, `Metas…`, abas de 2024 “com erros”) ficam fora do escopo inicial.

## Achados da importação real (Fase 6)

- Layout: cabeçalho na linha 7 + sublinha 8; 98 colunas de data (2 cabeçalhos com erro de digitação, ex.: `28/04/20262`, reportados como aviso e não adivinhados).
- Pessoa em Equipe → responsável e membro da etapa; Individual/Equipe Completa → tags; Scrum → Scrum Master da etapa.
- Status do projeto sem linha própria: derivado das etapas. Confidencialidade: a mais restritiva.
- Na prévia real: 194 válidos, 2 duplicados, ~20 com erro (linhas sem código, atividade ausente, `30/02/2026`, previsão anterior ao início, código × mapa divergente, letras duplicadas). Linhas com erro são ignoradas até a planilha ser corrigida; reimportar é seguro (idempotente).
