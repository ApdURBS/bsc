-- Integridade e rastreabilidade: auditoria e movimentações nunca podem ser alteradas ou apagadas,
-- nem por engano de código da aplicação. (Correção só via intervenção direta e deliberada no banco.)
CREATE OR REPLACE FUNCTION bsc_bloqueia_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registros de % são imutáveis (% bloqueado).', TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_imutavel BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION bsc_bloqueia_alteracao();
--> statement-breakpoint
CREATE TRIGGER movimentacoes_imutavel BEFORE UPDATE OR DELETE ON movimentacoes
  FOR EACH ROW EXECUTE FUNCTION bsc_bloqueia_alteracao();
