// Catálogo de permissões e perfis nativos. Novos perfis podem ser criados pela administração.
export const PERMISSIONS: { codigo: string; modulo: string; descricao: string }[] = [
  { codigo: 'dashboard.view', modulo: 'Dashboard', descricao: 'Visualizar dashboard' },
  { codigo: 'users.view', modulo: 'Usuários', descricao: 'Consultar usuários' },
  { codigo: 'users.create', modulo: 'Usuários', descricao: 'Criar usuários' },
  { codigo: 'users.update', modulo: 'Usuários', descricao: 'Editar e desativar usuários' },
  { codigo: 'roles.manage', modulo: 'Usuários', descricao: 'Criar perfis e gerenciar permissões' },
  { codigo: 'projects.view', modulo: 'Projetos', descricao: 'Visualizar projetos' },
  { codigo: 'projects.create', modulo: 'Projetos', descricao: 'Criar projetos' },
  { codigo: 'projects.update', modulo: 'Projetos', descricao: 'Editar projetos' },
  { codigo: 'projects.delete', modulo: 'Projetos', descricao: 'Excluir (inativar) projetos' },
  { codigo: 'stages.view', modulo: 'Etapas', descricao: 'Visualizar etapas' },
  { codigo: 'stages.create', modulo: 'Etapas', descricao: 'Criar etapas' },
  { codigo: 'stages.update', modulo: 'Etapas', descricao: 'Editar etapas' },
  { codigo: 'stages.custom_letter', modulo: 'Etapas', descricao: 'Alterar a letra sugerida da etapa' },
  { codigo: 'activities.view', modulo: 'Atividades', descricao: 'Visualizar atividades' },
  { codigo: 'activities.create', modulo: 'Atividades', descricao: 'Criar atividades' },
  { codigo: 'activities.update', modulo: 'Atividades', descricao: 'Editar atividades' },
  { codigo: 'movements.view', modulo: 'Movimentações', descricao: 'Visualizar movimentações' },
  { codigo: 'movements.create', modulo: 'Movimentações', descricao: 'Registrar movimentações' },
  { codigo: 'documents.view', modulo: 'Documentos', descricao: 'Consultar documentos' },
  { codigo: 'documents.create', modulo: 'Documentos', descricao: 'Inserir documentos' },
  { codigo: 'documents.manage', modulo: 'Documentos', descricao: 'Gerenciar e excluir documentos' },
  { codigo: 'occurrences.view', modulo: 'Ocorrências', descricao: 'Consultar ocorrências' },
  { codigo: 'occurrences.manage', modulo: 'Ocorrências', descricao: 'Registrar e editar ocorrências' },
  { codigo: 'reports.view', modulo: 'Relatórios', descricao: 'Consultar e exportar relatórios' },
  { codigo: 'audit.view', modulo: 'Auditoria', descricao: 'Visualizar o log completo de auditoria' },
  { codigo: 'audit.project_history', modulo: 'Auditoria', descricao: 'Ver histórico de alterações de um projeto' },
  { codigo: 'settings.manage', modulo: 'Configurações', descricao: 'Configurar o sistema' },
  { codigo: 'import.manage', modulo: 'Importação', descricao: 'Importar dados da planilha' },
];

const all = PERMISSIONS.map((p) => p.codigo);
const view = all.filter((c) => c.endsWith('.view'));

export const ROLES: { nome: string; descricao: string; permissoes: string[] }[] = [
  { nome: 'ADMINISTRADOR', descricao: 'Acesso total ao sistema', permissoes: all },
  {
    nome: 'OPERADOR',
    descricao: 'Gerencia projetos, etapas, atividades e movimentações',
    permissoes: [
      'dashboard.view', 'projects.view', 'projects.create', 'projects.update',
      'stages.view', 'stages.create', 'stages.update', 'activities.view', 'activities.create', 'activities.update',
      'movements.view', 'movements.create', 'documents.view', 'documents.create', 'occurrences.view', 'occurrences.manage',
      'reports.view', 'audit.project_history',
    ],
  },
  {
    nome: 'CONSULTA',
    descricao: 'Somente leitura',
    permissoes: view.filter((c) => !['users.view', 'audit.view'].includes(c)),
  },
  {
    nome: 'CONVIDADO',
    descricao: 'Somente leitura de conteúdo com acesso livre',
    permissoes: ['dashboard.view', 'projects.view', 'stages.view', 'activities.view', 'movements.view'],
  },
];

export const FRENTES = [
  ['1', 'Financeira'], ['2', 'Mercado'], ['3', 'Processos Internos'],
  ['4', 'Aprendizado'], ['5', 'Consultorias'], ['6', 'Interno URBS'],
] as const;

export const STATUS_PADRAO = [
  { nome: 'Aguardando', classificacao: 'INICIAL', cor: '#64748b' },
  { nome: 'Em andamento', classificacao: 'EM_ANDAMENTO', cor: '#2563eb' },
  { nome: 'Em atenção', classificacao: 'ATENCAO', cor: '#d97706' },
  { nome: 'Atrasado', classificacao: 'ATRASO', cor: '#dc2626' },
  { nome: 'Bloqueado', classificacao: 'BLOQUEIO', cor: '#9333ea' },
  { nome: 'Suspenso', classificacao: 'PAUSADO', cor: '#78716c' },
  { nome: 'Finalizado', classificacao: 'CONCLUIDO', cor: '#16a34a' },
  { nome: 'Cancelado', classificacao: 'CANCELADO', cor: '#475569' },
] as const;

export const CONFIG_PADRAO: Record<string, { valor: unknown; descricao: string }> = {
  'prazo.dias_atencao': { valor: 30, descricao: 'Prazo em atenção: faltam até N dias para a data prevista' },
  'prazo.dias_critico': { valor: 7, descricao: 'Prazo crítico: faltam até N dias para a data prevista' },
  'inatividade.dias': { valor: 15, descricao: 'Projeto sem movimentação há mais de N dias' },
  'sessao.horas': { valor: 8, descricao: 'Duração da sessão em horas' },
};

/** Regras de alerta criadas na primeira execução (o administrador pode editar, desativar ou criar outras). */
export const ALERTAS_PADRAO = [
  { nome: 'Prazo próximo (30 dias)', tipo: 'PRAZO_PROXIMO', antecedenciaDias: 30, frequencia: 'SEMANAL', destinatarios: { participantes: true, userIds: [] as number[] } },
  { nome: 'Prazo próximo (7 dias)', tipo: 'PRAZO_PROXIMO', antecedenciaDias: 7, frequencia: 'DIARIA', destinatarios: { participantes: true, userIds: [] as number[] } },
  { nome: 'Etapa ou projeto atrasado', tipo: 'ATRASO', antecedenciaDias: null, frequencia: 'SEMANAL', destinatarios: { participantes: true, userIds: [] as number[] } },
  { nome: 'Projeto sem movimentação', tipo: 'SEM_MOVIMENTACAO', antecedenciaDias: 15, frequencia: 'SEMANAL', destinatarios: { participantes: true, userIds: [] as number[] } },
  { nome: 'Pessoa com etapas atrasadas', tipo: 'ETAPAS_ATRASADAS_USUARIO', antecedenciaDias: 1, frequencia: 'SEMANAL', destinatarios: { participantes: true, userIds: [] as number[] } },
] as const;
