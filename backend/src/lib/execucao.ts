import { sql } from 'drizzle-orm';
import type { Executor } from '../db/index.js';

/** Etapa: % = peso das atividades concluídas / peso das atividades não canceladas. Sem atividades: 100% se a etapa está concluída. */
export async function recalcEtapa(ex: Executor, etapaId: number) {
  await ex.execute(sql`
    UPDATE etapas e SET percentual_execucao = COALESCE((
      SELECT CASE WHEN SUM(a.peso) FILTER (WHERE s.classificacao <> 'CANCELADO') > 0
        THEN ROUND(100.0 * COALESCE(SUM(a.peso) FILTER (WHERE s.classificacao = 'CONCLUIDO'),0)
             / SUM(a.peso) FILTER (WHERE s.classificacao <> 'CANCELADO'))
        ELSE NULL END
      FROM atividades a JOIN status s ON s.id = a.status_id WHERE a.etapa_id = e.id AND a.ativo), 
      (SELECT CASE WHEN s2.classificacao = 'CONCLUIDO' THEN 100 ELSE 0 END FROM status s2 WHERE s2.id = e.status_id))
    WHERE e.id = ${etapaId}`);
}

/** Projeto: % = peso das etapas concluídas / peso das etapas não canceladas (ex.: 7 de 10 = 70%). */
export async function recalcProjeto(ex: Executor, projetoId: number) {
  await ex.execute(sql`
    UPDATE projetos p SET percentual_execucao = COALESCE((
      SELECT CASE WHEN SUM(e.peso) FILTER (WHERE s.classificacao <> 'CANCELADO') > 0
        THEN ROUND(100.0 * COALESCE(SUM(e.peso) FILTER (WHERE s.classificacao = 'CONCLUIDO'),0)
             / SUM(e.peso) FILTER (WHERE s.classificacao <> 'CANCELADO'))
        ELSE NULL END
      FROM etapas e JOIN status s ON s.id = e.status_id WHERE e.projeto_id = p.id AND e.ativo),
      (SELECT CASE WHEN s2.classificacao = 'CONCLUIDO' THEN 100 ELSE 0 END FROM status s2 WHERE s2.id = p.status_id))
    WHERE p.id = ${projetoId}`);
  // Datas do projeto são derivadas das etapas ativas e não canceladas (menor início / maior previsão).
  await ex.execute(sql`
    UPDATE projetos p SET
      data_inicio = (SELECT MIN(e.data_inicio) FROM etapas e JOIN status s ON s.id = e.status_id
        WHERE e.projeto_id = p.id AND e.ativo AND s.classificacao <> 'CANCELADO'),
      data_prevista = (SELECT MAX(e.data_prevista) FROM etapas e JOIN status s ON s.id = e.status_id
        WHERE e.projeto_id = p.id AND e.ativo AND s.classificacao <> 'CANCELADO')
    WHERE p.id = ${projetoId}`);
}
