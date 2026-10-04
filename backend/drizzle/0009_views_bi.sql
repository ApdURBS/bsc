-- Fase 6: camada de dados para Power BI. Views somente leitura (prefixo bi_) sobre os dados brutos — nada é armazenado como valor calculado manualmente.
CREATE OR REPLACE FUNCTION bsc_hoje() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bsc_cfg_int(k text, padrao int) RETURNS int LANGUAGE sql STABLE AS $$ SELECT COALESCE((SELECT (valor #>> '{}')::int FROM configuracoes WHERE chave = k), padrao) $$;
--> statement-breakpoint
-- Mesma regra do sistema: limites configuráveis em Configurações (prazo.dias_atencao / prazo.dias_critico).
CREATE OR REPLACE FUNCTION bsc_situacao_prazo(prevista date, classif text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN classif IN ('CONCLUIDO','CANCELADO') THEN 'ENCERRADO'
    WHEN prevista IS NULL THEN 'SEM_PRAZO'
    WHEN prevista < bsc_hoje() THEN 'VENCIDO'
    WHEN prevista - bsc_hoje() <= bsc_cfg_int('prazo.dias_critico', 7) THEN 'CRITICO'
    WHEN prevista - bsc_hoje() <= bsc_cfg_int('prazo.dias_atencao', 30) THEN 'ATENCAO'
    ELSE 'NORMAL' END
$$;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_dim_frentes AS
  SELECT id AS frente_id, codigo AS frente_codigo, nome AS frente, ativo FROM frentes;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_dim_status AS
  SELECT id AS status_id, nome AS status, classificacao::text AS classificacao, (classificacao::text NOT IN ('CONCLUIDO','CANCELADO')) AS em_aberto, ativo FROM status;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_dim_pessoas AS
  SELECT u.id AS pessoa_id, u.nome, r.nome AS perfil, u.pertence_apd, u.ativo FROM users u JOIN roles r ON r.id = u.role_id;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_dim_calendario AS
  SELECT d::date AS data, EXTRACT(year FROM d)::int AS ano, EXTRACT(month FROM d)::int AS mes, to_char(d, 'YYYY-MM') AS ano_mes, EXTRACT(isodow FROM d)::int AS dia_semana
  FROM generate_series(date '2024-01-01', date '2030-12-31', interval '1 day') d;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_projetos AS
  SELECT b.*,
    (b.status_classificacao NOT IN ('CONCLUIDO','CANCELADO')) AS em_aberto,
    (b.status_classificacao NOT IN ('CONCLUIDO','CANCELADO') AND (b.status_classificacao = 'ATRASO' OR b.situacao_prazo = 'VENCIDO')) AS atrasado,
    CASE WHEN b.status_classificacao NOT IN ('CONCLUIDO','CANCELADO') AND b.data_prevista >= bsc_hoje() THEN b.data_prevista - bsc_hoje() END AS dias_restantes,
    CASE WHEN b.status_classificacao NOT IN ('CONCLUIDO','CANCELADO') AND b.data_prevista < bsc_hoje() THEN bsc_hoje() - b.data_prevista END AS dias_atraso,
    (bsc_hoje() - (COALESCE(b.ultima_movimentacao_em, b.created_at) AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_sem_movimentacao,
    (b.status_classificacao NOT IN ('CONCLUIDO','CANCELADO') AND (bsc_hoje() - (COALESCE(b.ultima_movimentacao_em, b.created_at) AT TIME ZONE 'America/Sao_Paulo')::date) > bsc_cfg_int('inatividade.dias', 15)) AS sem_movimentacao_recente
  FROM (
    SELECT p.id AS projeto_id, p.codigo, p.nome, f.id AS frente_id, f.codigo AS frente_codigo, f.nome AS frente, d.nome AS dono, d.id AS dono_id,
      s.id AS status_id, s.nome AS status, s.classificacao::text AS status_classificacao, c.nome AS confidencialidade, c.nivel AS confidencialidade_nivel,
      p.data_inicio, p.data_prevista, p.data_conclusao_real, p.percentual_execucao, p.ultima_movimentacao_em, p.created_at, p.ativo, (p.importacao_id IS NOT NULL) AS importado,
      bsc_situacao_prazo(p.data_prevista, s.classificacao::text) AS situacao_prazo,
      (SELECT string_agg(DISTINCT u.nome, ', ') FROM etapas e JOIN users u ON u.id = e.scrum_master_id WHERE e.projeto_id = p.id AND e.ativo) AS scrum_masters,
      (SELECT string_agg(DISTINCT u.nome, ', ') FROM etapa_membros em JOIN etapas e ON e.id = em.etapa_id JOIN users u ON u.id = em.user_id WHERE e.projeto_id = p.id AND e.ativo) AS equipe,
      (SELECT count(*) FROM etapas e WHERE e.projeto_id = p.id AND e.ativo)::int AS total_etapas,
      (SELECT count(*) FROM etapas e JOIN status se ON se.id = e.status_id WHERE e.projeto_id = p.id AND e.ativo AND se.classificacao::text = 'CONCLUIDO')::int AS etapas_concluidas
    FROM projetos p JOIN frentes f ON f.id = p.frente_id JOIN status s ON s.id = p.status_id JOIN confidencialidades c ON c.id = p.confidencialidade_id LEFT JOIN users d ON d.id = p.dono_id
  ) b;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_etapas AS
  SELECT b.*,
    (b.status_classificacao NOT IN ('CONCLUIDO','CANCELADO') AND (b.status_classificacao = 'ATRASO' OR b.situacao_prazo = 'VENCIDO')) AS atrasada,
    CASE WHEN b.status_classificacao NOT IN ('CONCLUIDO','CANCELADO') AND b.data_prevista < bsc_hoje() THEN bsc_hoje() - b.data_prevista END AS dias_atraso
  FROM (
    SELECT e.id AS etapa_id, p.id AS projeto_id, p.codigo AS projeto_codigo, p.codigo || ' ' || e.letra AS codigo_etapa, p.nome AS projeto, f.id AS frente_id, f.nome AS frente,
      e.letra, e.nome, r.nome AS responsavel, sm.nome AS scrum_master, s.nome AS status, s.classificacao::text AS status_classificacao,
      e.data_inicio, e.data_prevista, e.data_conclusao_real, e.percentual_execucao, e.peso, array_to_string(e.tags, ', ') AS tags, e.ativo,
      (SELECT string_agg(u.nome, ', ' ORDER BY u.nome) FROM etapa_membros em JOIN users u ON u.id = em.user_id WHERE em.etapa_id = e.id) AS equipe,
      c.nome AS confidencialidade, c.nivel AS confidencialidade_nivel, bsc_situacao_prazo(e.data_prevista, s.classificacao::text) AS situacao_prazo
    FROM etapas e JOIN projetos p ON p.id = e.projeto_id JOIN frentes f ON f.id = p.frente_id JOIN status s ON s.id = e.status_id JOIN confidencialidades c ON c.id = p.confidencialidade_id
      LEFT JOIN users r ON r.id = e.responsavel_id LEFT JOIN users sm ON sm.id = e.scrum_master_id
  ) b;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_atividades AS
  SELECT a.id AS atividade_id, e.id AS etapa_id, p.id AS projeto_id, p.codigo || ' ' || e.letra AS codigo_etapa, p.nome AS projeto, f.nome AS frente, a.nome, r.nome AS responsavel,
    s.nome AS status, s.classificacao::text AS status_classificacao, a.data_inicio, a.data_prevista, a.data_conclusao_real, a.peso, a.ativo,
    bsc_situacao_prazo(a.data_prevista, s.classificacao::text) AS situacao_prazo, c.nome AS confidencialidade, c.nivel AS confidencialidade_nivel
  FROM atividades a JOIN etapas e ON e.id = a.etapa_id JOIN projetos p ON p.id = e.projeto_id JOIN frentes f ON f.id = p.frente_id JOIN status s ON s.id = a.status_id
    JOIN confidencialidades c ON c.id = p.confidencialidade_id LEFT JOIN users r ON r.id = a.responsavel_id;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_movimentacoes AS
  SELECT m.id AS movimentacao_id, m.data_hora, (m.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS data, to_char(m.data_hora AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS ano_mes,
    p.id AS projeto_id, p.codigo AS projeto_codigo, p.nome AS projeto, f.id AS frente_id, f.nome AS frente, e.letra AS etapa, a.nome AS atividade,
    u.id AS usuario_id, u.nome AS usuario, t.nome AS tipo, m.descricao, m.importada, c.nome AS confidencialidade, c.nivel AS confidencialidade_nivel
  FROM movimentacoes m JOIN projetos p ON p.id = m.projeto_id JOIN frentes f ON f.id = p.frente_id JOIN users u ON u.id = m.usuario_id JOIN tipos_movimentacao t ON t.id = m.tipo_id
    JOIN confidencialidades c ON c.id = p.confidencialidade_id LEFT JOIN etapas e ON e.id = m.etapa_id LEFT JOIN atividades a ON a.id = m.atividade_id;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_movimentacoes_mensal AS
  SELECT ano_mes, frente_id, frente, projeto_id, projeto_codigo, usuario_id, usuario, count(*)::int AS movimentacoes
  FROM bi_movimentacoes GROUP BY ano_mes, frente_id, frente, projeto_id, projeto_codigo, usuario_id, usuario;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_ocorrencias AS
  SELECT o.id AS ocorrencia_id, o.titulo, o.data::date AS data, o.severidade::text AS severidade, o.status, p.id AS projeto_id, p.codigo AS projeto_codigo, p.nome AS projeto, f.nome AS frente,
    e.letra AS etapa, t.nome AS tipo, r.nome AS responsavel, o.prazo_resolucao, o.data_resolucao,
    (o.status IN ('ABERTA','EM_TRATAMENTO')) AS aberta,
    (o.status IN ('ABERTA','EM_TRATAMENTO') AND o.prazo_resolucao < bsc_hoje()) AS vencida,
    c.nome AS confidencialidade, c.nivel AS confidencialidade_nivel
  FROM ocorrencias o JOIN projetos p ON p.id = o.projeto_id JOIN frentes f ON f.id = p.frente_id JOIN confidencialidades c ON c.id = p.confidencialidade_id
    LEFT JOIN etapas e ON e.id = o.etapa_id LEFT JOIN tipos_ocorrencia t ON t.id = o.tipo_id LEFT JOIN users r ON r.id = o.responsavel_id;
--> statement-breakpoint
CREATE OR REPLACE VIEW bi_documentos AS
  SELECT d.id AS documento_id, d.nome, d.categoria, t.nome AS tipo, p.id AS projeto_id, p.codigo AS projeto_codigo, e.letra AS etapa, r.nome AS responsavel, d.created_at, d.ativo,
    (SELECT max(v.versao) FROM documento_versoes v WHERE v.documento_id = d.id) AS versao_atual, (d.caminho_rede IS NOT NULL) AS tem_caminho_rede,
    c.nome AS confidencialidade, c.nivel AS confidencialidade_nivel
  FROM documentos d JOIN projetos p ON p.id = d.projeto_id JOIN confidencialidades c ON c.id = p.confidencialidade_id
    LEFT JOIN tipos_documento t ON t.id = d.tipo_id LEFT JOIN etapas e ON e.id = d.etapa_id LEFT JOIN users r ON r.id = d.responsavel_id;
