# Integração com Power BI

O sistema guarda dados brutos e estruturados; nenhum indicador é gravado como valor fixo. A migração `0009_views_bi.sql` cria **views somente leitura** (prefixo `bi_`) que calculam prazo, atraso, dias sem movimentação etc. com as mesmas regras e limites configurados em *Configurações*.

## Views

| View | Conteúdo |
|---|---|
| `bi_dim_frentes`, `bi_dim_status`, `bi_dim_pessoas`, `bi_dim_calendario` | Dimensões (pessoas sem e-mail/senha; calendário 2024–2030) |
| `bi_projetos` | 1 linha por projeto: frente, dono, status, execução, datas, `situacao_prazo`, `atrasado`, `dias_restantes`, `dias_atraso`, `dias_sem_movimentacao`, `sem_movimentacao_recente`, Scrum Masters, equipe, etapas totais/concluídas |
| `bi_etapas`, `bi_atividades` | Detalhe com responsável, status, prazos e situação de prazo |
| `bi_movimentacoes` | 1 linha por movimentação (data, `ano_mes`, projeto, frente, etapa, atividade, usuário, tipo, `importada`) |
| `bi_movimentacoes_mensal` | Agregado mensal por frente/projeto/usuário |
| `bi_ocorrencias`, `bi_documentos` | Ocorrências e metadados de documentos (sem caminho de arquivo) |

Todas as views de dados trazem `confidencialidade` e `confidencialidade_nivel`, para segurança em nível de linha (RLS) no Power BI.

## Conexão (PostgreSQL)

1. Crie um usuário **somente leitura** no banco:

```sql
CREATE ROLE bi_leitura LOGIN PASSWORD 'troque-esta-senha';
GRANT CONNECT ON DATABASE bsc TO bi_leitura;
GRANT USAGE ON SCHEMA public TO bi_leitura;
GRANT SELECT ON bi_dim_frentes, bi_dim_status, bi_dim_pessoas, bi_dim_calendario,
  bi_projetos, bi_etapas, bi_atividades, bi_movimentacoes, bi_movimentacoes_mensal,
  bi_ocorrencias, bi_documentos TO bi_leitura;
```

(As views são lidas com os direitos do proprietário; o `bi_leitura` não precisa de acesso às tabelas base.)

2. No Power BI Desktop: *Obter dados → Banco de dados PostgreSQL*, informe servidor e banco, use o usuário `bi_leitura` e selecione as views `bi_*`. Relacione `frente_id`, `projeto_id` e `data` ↔ `bi_dim_calendario[data]`.

### No Supabase

O host/porta mudam para os dados do projeto Supabase (painel → *Project Settings → Database*):

- Conexão direta: `db.<ref-do-projeto>.supabase.co`, porta `5432`.
- Connection pooling (recomendado para ferramentas externas como o Power BI, evita esgotar conexões): host do pooler, porta `6543`, modo *session* (o modo *transaction* não é adequado para sessões longas do Power BI).
- Marque **Encryption: Required/SSL** na conexão do Power BI — o Supabase exige SSL.
- O `CREATE ROLE bi_leitura` acima funciona normalmente no Supabase via SQL Editor do painel ou `psql`.

## Atenção à confidencialidade

O acesso direto ao banco **ignora** a confidencialidade aplicada pelo sistema (Livre / Interno URBS / Interno APD). Quem recebe o `bi_leitura` enxerga tudo. Para restringir, use RLS no Power BI com `confidencialidade_nivel`, ou publique só relatórios para público autorizado.

## Alternativa: API

Os relatórios podem ser consumidos via `GET /api/reports/{id}?formato=csv|json` (respeitam a confidencialidade do usuário autenticado). A especificação completa está em `/api/docs`.
