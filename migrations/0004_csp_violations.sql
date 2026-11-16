-- Observar a semana sem violação de CSP antes de ligar o bloqueio (etapa 6, docs/PLANO-PROXIMOS-PASSOS.md).
-- Uma linha por violação única (diretiva + endereço bloqueado), não um relatório por ocorrência: o endpoint
-- continua sem exigir sessão (é o mecanismo nativo do navegador) sem virar um jeito de encher o banco.
CREATE TABLE csp_violations (
  violated_directive TEXT NOT NULL,
  blocked_uri TEXT NOT NULL,
  document_uri TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (violated_directive, blocked_uri)
);
