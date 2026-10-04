// Especificação OpenAPI 3.0 do Controle BSC APD/UPD. Servida em /api/openapi.json e exibida em /api/docs.
type Schema = Record<string, unknown>;
const S = (type: string, extra: Schema = {}): Schema => ({ type, ...extra });
const str = (d?: string): Schema => S('string', d ? { description: d } : {});
const int = (d?: string): Schema => S('integer', d ? { description: d } : {});
const date = (d = 'AAAA-MM-DD'): Schema => S('string', { format: 'date', description: d });
const en = (...v: string[]): Schema => S('string', { enum: v });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const arr = (items: Schema): Schema => ({ type: 'array', items });

type Param = [name: string, tipo: 'integer' | 'string' | 'boolean', descricao: string];
interface Op { m: 'get' | 'post' | 'patch' | 'put' | 'delete'; p: string; tag: string; resumo: string; perm?: string; q?: Param[]; body?: Schema; multipart?: Schema; resp?: string; bin?: string }

const PAG: Param[] = [['page', 'integer', 'Página (padrão 1)'], ['pageSize', 'integer', 'Itens por página (padrão 25, máx. 200)']];
const projetoBody = obj({ frenteId: int(), sequencia: int('Número do código dentro da frente (opcional; padrão = próximo livre)'), nome: str(), descricao: str(), donoId: int('Usuário da APD/UPD'), statusId: int(), confidencialidadeId: int(), pastaCaminho: str('Referência de pasta de rede'), observacoes: str() }, ['frenteId', 'nome']);
const etapaBody = obj({ letra: str('Opcional; padrão = próxima letra livre'), nome: str(), descricao: str(), responsavelId: int(), scrumMasterId: int(), membros: arr(int()), tags: arr(str()), statusId: int(), dataInicio: date(), dataPrevista: date(), dataConclusaoReal: date(), peso: int(), pastaCaminho: str() }, ['nome']);
const atividadeBody = obj({ nome: str(), descricao: str(), responsavelId: int(), statusId: int(), dataInicio: date(), dataPrevista: date(), dataConclusaoReal: date(), peso: int() }, ['nome']);
const docForm = obj({ arquivo: { type: 'string', format: 'binary' }, projetoId: int(), nome: str(), categoria: en('Relatórios', 'Documentos', 'Evidências', 'Outros'), tipoId: int(), etapaId: int(), atividadeId: int(), ocorrenciaId: int(), responsavelId: int(), caminhoRede: str('Referência de pasta de rede (obrigatória se não houver arquivo)'), observacao: str() }, ['projetoId']);

const OPS: Op[] = [
  { m: 'post', p: '/auth/login', tag: 'Autenticação', resumo: 'Entrar (cria o cookie de sessão e o cookie CSRF)', body: obj({ usuario: str(), senha: str() }, ['usuario', 'senha']) },
  { m: 'post', p: '/auth/logout', tag: 'Autenticação', resumo: 'Sair (revoga a sessão)' },
  { m: 'get', p: '/auth/me', tag: 'Autenticação', resumo: 'Usuário logado, perfil e permissões' },
  { m: 'post', p: '/auth/change-password', tag: 'Autenticação', resumo: 'Trocar a própria senha', body: obj({ senhaAtual: str(), novaSenha: str() }, ['senhaAtual', 'novaSenha']) },
  { m: 'post', p: '/auth/forgot-password', tag: 'Autenticação', resumo: 'Solicitar redefinição de senha por e-mail', body: obj({ email: str() }, ['email']) },
  { m: 'post', p: '/auth/reset-password', tag: 'Autenticação', resumo: 'Redefinir a senha com o token recebido', body: obj({ token: str(), novaSenha: str() }, ['token', 'novaSenha']) },

  { m: 'get', p: '/users', tag: 'Usuários e perfis', resumo: 'Listar usuários', perm: 'users.view', q: [...PAG, ['busca', 'string', 'Nome, usuário ou e-mail']] },
  { m: 'get', p: '/users/pessoas', tag: 'Usuários e perfis', resumo: 'Usuários ativos da APD/UPD (Dono, Scrum Master, equipe, responsáveis)' },
  { m: 'post', p: '/users', tag: 'Usuários e perfis', resumo: 'Criar usuário', perm: 'users.create', body: obj({ nome: str(), username: str(), email: str(), senha: str(), roleId: int(), pertenceApd: S('boolean'), convidado: S('boolean') }, ['nome', 'username', 'email', 'senha', 'roleId']) },
  { m: 'patch', p: '/users/{id}', tag: 'Usuários e perfis', resumo: 'Editar, ativar/desativar ou trocar o perfil do usuário', perm: 'users.update', body: obj({ nome: str(), email: str(), roleId: int(), ativo: S('boolean'), pertenceApd: S('boolean'), senha: str() }) },
  { m: 'get', p: '/roles', tag: 'Usuários e perfis', resumo: 'Listar perfis com suas permissões', perm: 'roles.manage' },
  { m: 'get', p: '/roles/permissions', tag: 'Usuários e perfis', resumo: 'Catálogo de permissões', perm: 'roles.manage' },
  { m: 'post', p: '/roles', tag: 'Usuários e perfis', resumo: 'Criar perfil', perm: 'roles.manage', body: obj({ nome: str(), descricao: str(), permissoes: arr(str()) }, ['nome']) },
  { m: 'put', p: '/roles/{id}', tag: 'Usuários e perfis', resumo: 'Alterar perfil e permissões', perm: 'roles.manage', body: obj({ nome: str(), descricao: str(), permissoes: arr(str()) }) },

  { m: 'get', p: '/frentes', tag: 'Cadastros', resumo: 'Frentes do BSC (?todos=1 inclui inativas)' },
  { m: 'post', p: '/frentes', tag: 'Cadastros', resumo: 'Criar frente', perm: 'settings.manage', body: obj({ codigo: str(), nome: str() }, ['codigo', 'nome']) },
  { m: 'patch', p: '/frentes/{id}', tag: 'Cadastros', resumo: 'Editar frente', perm: 'settings.manage', body: obj({ nome: str(), ativo: S('boolean') }) },
  { m: 'get', p: '/status', tag: 'Cadastros', resumo: 'Status (e classificação usada nas regras de atraso)' },
  { m: 'get', p: '/confidencialidades', tag: 'Cadastros', resumo: 'Níveis de confidencialidade' },
  { m: 'get', p: '/tipos-movimentacao', tag: 'Cadastros', resumo: 'Tipos de movimentação' },
  { m: 'get', p: '/tipos-documento', tag: 'Cadastros', resumo: 'Tipos de documento' },
  { m: 'get', p: '/tipos-ocorrencia', tag: 'Cadastros', resumo: 'Tipos de ocorrência' },

  { m: 'get', p: '/projects', tag: 'Projetos', resumo: 'Listar projetos (paginado, filtros combináveis)', perm: 'projects.view', q: [...PAG, ['busca', 'string', 'Código, nome, etapa, atividade, pessoa'], ['frenteId', 'integer', ''], ['statusId', 'integer', ''], ['scrumMasterId', 'integer', 'Scrum Master em alguma etapa'], ['donoId', 'integer', ''], ['responsavelId', 'integer', 'Participa: dono, responsável, Scrum Master ou equipe de etapa'], ['confidencialidadeId', 'integer', ''], ['situacaoPrazo', 'string', 'NORMAL | ATENCAO | CRITICO | VENCIDO'], ['card', 'string', 'total | vigentes | andamento | finalizados | atrasados | bloqueados | suspensos | semMovimentacao'], ['prazoDe', 'string', ''], ['prazoAte', 'string', ''], ['movDe', 'string', ''], ['movAte', 'string', ''], ['semMovimentacaoDias', 'integer', ''], ['meus', 'boolean', 'Somente projetos em que participo'], ['sort', 'string', 'codigo | nome | frente | status | prazo | execucao | ultimaMovimentacao'], ['dir', 'string', 'asc | desc']] },
  { m: 'get', p: '/projects/next-code', tag: 'Projetos', resumo: 'Próximo código livre da frente', perm: 'projects.create', q: [['frenteId', 'integer', '']] },
  { m: 'get', p: '/projects/code-available', tag: 'Projetos', resumo: 'Verifica se um código está livre', perm: 'projects.create', q: [['frenteId', 'integer', ''], ['sequencia', 'integer', '']] },
  { m: 'post', p: '/projects', tag: 'Projetos', resumo: 'Criar projeto (gera o código FRENTE_N de forma atômica)', perm: 'projects.create', body: projetoBody },
  { m: 'get', p: '/projects/{id}', tag: 'Projetos', resumo: 'Detalhe do projeto', perm: 'projects.view' },
  { m: 'patch', p: '/projects/{id}', tag: 'Projetos', resumo: 'Editar projeto (cada campo alterado é auditado)', perm: 'projects.update', body: projetoBody },
  { m: 'delete', p: '/projects/{id}', tag: 'Projetos', resumo: 'Excluir (lógico) ou reativar projeto', perm: 'projects.delete' },
  { m: 'get', p: '/projects/{id}/timeline', tag: 'Projetos', resumo: 'Linha do tempo: movimentações, mudanças de status, documentos', perm: 'projects.view' },
  { m: 'get', p: '/projects/{id}/audit', tag: 'Projetos', resumo: 'Histórico de alterações do projeto', perm: 'audit.project_history', q: PAG },
  { m: 'get', p: '/projects/{id}/stages', tag: 'Etapas', resumo: 'Etapas do projeto', perm: 'stages.view' },
  { m: 'post', p: '/projects/{id}/stages', tag: 'Etapas', resumo: 'Criar etapa (letra sugerida automaticamente)', perm: 'stages.create', body: etapaBody },
  { m: 'get', p: '/projects/{id}/stages/next-letter', tag: 'Etapas', resumo: 'Próxima letra livre', perm: 'stages.create' },
  { m: 'get', p: '/projects/{id}/stages/letter-available', tag: 'Etapas', resumo: 'Verifica se uma letra está livre no projeto', perm: 'stages.create', q: [['letra', 'string', '']] },

  { m: 'get', p: '/stages', tag: 'Etapas', resumo: 'Listar etapas (global, paginado)', perm: 'stages.view', q: [...PAG, ['projetoId', 'integer', ''], ['statusId', 'integer', ''], ['responsavelId', 'integer', ''], ['scrumMasterId', 'integer', ''], ['busca', 'string', ''], ['atrasadas', 'boolean', '']] },
  { m: 'get', p: '/stages/{id}', tag: 'Etapas', resumo: 'Detalhe da etapa', perm: 'stages.view' },
  { m: 'patch', p: '/stages/{id}', tag: 'Etapas', resumo: 'Editar etapa', perm: 'stages.update', body: etapaBody },
  { m: 'get', p: '/stages/{id}/activities', tag: 'Atividades', resumo: 'Atividades da etapa', perm: 'activities.view' },
  { m: 'post', p: '/stages/{id}/activities', tag: 'Atividades', resumo: 'Criar atividade', perm: 'activities.create', body: atividadeBody },
  { m: 'get', p: '/activities', tag: 'Atividades', resumo: 'Listar atividades (global, paginado)', perm: 'activities.view', q: [...PAG, ['projetoId', 'integer', ''], ['etapaId', 'integer', ''], ['statusId', 'integer', ''], ['responsavelId', 'integer', ''], ['busca', 'string', '']] },
  { m: 'patch', p: '/activities/{id}', tag: 'Atividades', resumo: 'Editar atividade', perm: 'activities.update', body: atividadeBody },

  { m: 'get', p: '/movements', tag: 'Movimentações', resumo: 'Histórico de movimentações (paginado)', perm: 'movements.view', q: [...PAG, ['projetoId', 'integer', ''], ['etapaId', 'integer', ''], ['atividadeId', 'integer', ''], ['usuarioId', 'integer', ''], ['tipoId', 'integer', ''], ['de', 'string', 'AAAA-MM-DD'], ['ate', 'string', 'AAAA-MM-DD'], ['busca', 'string', '']] },
  { m: 'get', p: '/movements/usuarios', tag: 'Movimentações', resumo: 'Usuários que já registraram movimentações', perm: 'movements.view' },
  { m: 'post', p: '/movements', tag: 'Movimentações', resumo: 'Registrar movimentação — somente inserção (nunca editada nem apagada)', perm: 'movements.create', body: obj({ projetoId: int(), etapaId: int(), atividadeId: int(), tipoId: int(), descricao: str(), data: date('Retroativa, opcional'), hora: str('HH:MM, opcional') }, ['projetoId', 'tipoId', 'descricao']) },

  { m: 'get', p: '/documents', tag: 'Documentos', resumo: 'Listar documentos', perm: 'documents.view', q: [...PAG, ['projetoId', 'integer', ''], ['etapaId', 'integer', ''], ['atividadeId', 'integer', ''], ['ocorrenciaId', 'integer', ''], ['tipoId', 'integer', ''], ['categoria', 'string', ''], ['busca', 'string', '']] },
  { m: 'post', p: '/documents', tag: 'Documentos', resumo: 'Enviar documento (multipart) ou registrar referência de pasta de rede', perm: 'documents.create', multipart: docForm },
  { m: 'get', p: '/documents/{id}', tag: 'Documentos', resumo: 'Detalhe com histórico de versões', perm: 'documents.view' },
  { m: 'patch', p: '/documents/{id}', tag: 'Documentos', resumo: 'Editar metadados do documento', perm: 'documents.create', body: obj({ nome: str(), tipoId: int(), categoria: str(), etapaId: int(), atividadeId: int(), responsavelId: int(), caminhoRede: str(), observacao: str() }) },
  { m: 'delete', p: '/documents/{id}', tag: 'Documentos', resumo: 'Excluir (lógico, auditado; versões preservadas)', perm: 'documents.manage' },
  { m: 'post', p: '/documents/{id}/versions', tag: 'Documentos', resumo: 'Enviar nova versão (multipart)', perm: 'documents.create', multipart: obj({ arquivo: { type: 'string', format: 'binary' }, observacao: str() }, ['arquivo']) },
  { m: 'get', p: '/documents/{id}/download', tag: 'Documentos', resumo: 'Baixar (inline=1 abre PDF/imagens no navegador; versao= escolhe a versão)', perm: 'documents.view', q: [['versao', 'integer', ''], ['inline', 'string', '1 para visualizar']], bin: 'Conteúdo do arquivo' },

  { m: 'get', p: '/occurrences', tag: 'Ocorrências', resumo: 'Listar ocorrências', perm: 'occurrences.view', q: [...PAG, ['projetoId', 'integer', ''], ['etapaId', 'integer', ''], ['responsavelId', 'integer', ''], ['tipoId', 'integer', ''], ['status', 'string', 'ABERTA | EM_TRATAMENTO | RESOLVIDA | CANCELADA'], ['severidade', 'string', 'BAIXA | MEDIA | ALTA | CRITICA'], ['aberta', 'boolean', ''], ['vencida', 'boolean', ''], ['busca', 'string', '']] },
  { m: 'get', p: '/occurrences/{id}', tag: 'Ocorrências', resumo: 'Detalhe da ocorrência', perm: 'occurrences.view' },
  { m: 'post', p: '/occurrences', tag: 'Ocorrências', resumo: 'Registrar ocorrência', perm: 'occurrences.manage', body: obj({ projetoId: int(), titulo: str(), descricao: str(), data: date(), etapaId: int(), atividadeId: int(), tipoId: int(), responsavelId: int(), severidade: en('BAIXA', 'MEDIA', 'ALTA', 'CRITICA'), prazoResolucao: date() }, ['projetoId', 'titulo']) },
  { m: 'patch', p: '/occurrences/{id}', tag: 'Ocorrências', resumo: 'Editar / resolver / reabrir / cancelar (não há exclusão)', perm: 'occurrences.manage', body: obj({ titulo: str(), descricao: str(), severidade: en('BAIXA', 'MEDIA', 'ALTA', 'CRITICA'), status: en('ABERTA', 'EM_TRATAMENTO', 'RESOLVIDA', 'CANCELADA'), etapaId: int(), atividadeId: int(), tipoId: int(), responsavelId: int(), prazoResolucao: date(), dataResolucao: date(), solucao: str('Obrigatória ao resolver') }) },

  { m: 'get', p: '/dashboard/summary', tag: 'Dashboard e indicadores', resumo: 'Cards, projetos por frente, faixas de prazo e atividades recentes', perm: 'dashboard.view' },
  { m: 'get', p: '/dashboard/prazos', tag: 'Dashboard e indicadores', resumo: 'Painel de prazos (projetos e etapas por faixa)', perm: 'dashboard.view' },
  { m: 'get', p: '/dashboard/por-scrum', tag: 'Dashboard e indicadores', resumo: 'Indicadores por Scrum Master', perm: 'dashboard.view' },
  { m: 'get', p: '/dashboard/por-equipe', tag: 'Dashboard e indicadores', resumo: 'Indicadores por pessoa da equipe', perm: 'dashboard.view' },
  { m: 'get', p: '/dashboard/indicadores', tag: 'Dashboard e indicadores', resumo: 'Indicadores gerenciais (totais, percentuais, prazo médio, tempo médio de conclusão)', perm: 'dashboard.view' },
  { m: 'get', p: '/dashboard/inatividade', tag: 'Dashboard e indicadores', resumo: 'Projetos sem movimentação recente', perm: 'dashboard.view', q: [['dias', 'integer', '']] },
  { m: 'get', p: '/dashboard/movimentacoes-mes', tag: 'Dashboard e indicadores', resumo: 'Movimentações por mês', perm: 'dashboard.view', q: [['meses', 'integer', ''], ['projetoId', 'integer', ''], ['frenteId', 'integer', ''], ['usuarioId', 'integer', ''], ['scrumMasterId', 'integer', ''], ['membroId', 'integer', '']] },
  { m: 'get', p: '/search', tag: 'Dashboard e indicadores', resumo: 'Busca global (projetos, etapas, atividades)', perm: 'projects.view', q: [['q', 'string', 'Termo']] },

  { m: 'get', p: '/notifications', tag: 'Notificações e alertas', resumo: 'Minhas notificações', q: [...PAG, ['naoLidas', 'boolean', '']] },
  { m: 'get', p: '/notifications/count', tag: 'Notificações e alertas', resumo: 'Quantidade de não lidas' },
  { m: 'post', p: '/notifications/{id}/read', tag: 'Notificações e alertas', resumo: 'Marcar como lida' },
  { m: 'post', p: '/notifications/read-all', tag: 'Notificações e alertas', resumo: 'Marcar todas como lidas' },
  { m: 'get', p: '/alerts', tag: 'Notificações e alertas', resumo: 'Regras de alerta', perm: 'settings.manage' },
  { m: 'post', p: '/alerts', tag: 'Notificações e alertas', resumo: 'Criar regra de alerta', perm: 'settings.manage', body: obj({ nome: str(), tipo: en('PRAZO_PROXIMO', 'ATRASO', 'SEM_MOVIMENTACAO', 'ETAPAS_ATRASADAS_USUARIO'), antecedenciaDias: int(), frequencia: en('DIARIA', 'SEMANAL', 'UNICA'), destinatarios: obj({ participantes: S('boolean'), userIds: arr(int()) }) }, ['nome', 'tipo']) },
  { m: 'patch', p: '/alerts/{id}', tag: 'Notificações e alertas', resumo: 'Editar regra de alerta', perm: 'settings.manage', body: obj({ nome: str(), antecedenciaDias: int(), frequencia: str(), ativo: S('boolean') }) },
  { m: 'delete', p: '/alerts/{id}', tag: 'Notificações e alertas', resumo: 'Excluir regra de alerta', perm: 'settings.manage' },
  { m: 'post', p: '/alerts/run', tag: 'Notificações e alertas', resumo: 'Gerar notificações agora', perm: 'settings.manage' },

  { m: 'get', p: '/reports', tag: 'Relatórios', resumo: 'Catálogo de relatórios disponíveis ao usuário', perm: 'reports.view' },
  { m: 'get', p: '/reports/{id}', tag: 'Relatórios', resumo: 'Gerar relatório (json, xlsx, csv ou pdf)', perm: 'reports.view', q: [['formato', 'string', 'json | xlsx | csv | pdf'], ['frenteId', 'integer', ''], ['statusId', 'integer', ''], ['donoId', 'integer', ''], ['projetoId', 'integer', ''], ['userId', 'integer', ''], ['dias', 'integer', 'Relatório “a vencer”'], ['modulo', 'string', 'Auditoria'], ['de', 'string', ''], ['ate', 'string', '']], bin: 'Arquivo do relatório (quando formato ≠ json)' },

  { m: 'post', p: '/import/preview', tag: 'Importação', resumo: 'Analisa a planilha (.xlsx/.csv) e devolve a prévia — não grava nada', perm: 'import.manage', multipart: obj({ arquivo: { type: 'string', format: 'binary' }, aba: str('Padrão: aba com o ano, ex. 2026') }, ['arquivo']) },
  { m: 'get', p: '/import', tag: 'Importação', resumo: 'Histórico de importações', perm: 'import.manage', q: PAG },
  { m: 'get', p: '/import/{id}', tag: 'Importação', resumo: 'Prévia/resultado: resumo, colunas, pessoas e problemas', perm: 'import.manage' },
  { m: 'get', p: '/import/{id}/linhas', tag: 'Importação', resumo: 'Linhas da prévia por situação (VALIDO | ERRO | DUPLICADO)', perm: 'import.manage', q: [...PAG, ['estado', 'string', '']] },
  { m: 'get', p: '/import/{id}/problemas.csv', tag: 'Importação', resumo: 'Problemas encontrados em CSV', perm: 'import.manage', bin: 'CSV' },
  { m: 'post', p: '/import/{id}/confirm', tag: 'Importação', resumo: 'Confirma e grava (uma transação, rastreável)', perm: 'import.manage', body: obj({ pessoas: { type: 'object', additionalProperties: { type: 'integer', nullable: true }, description: 'Nome na planilha → id do usuário (null = sem vínculo)' } }) },
  { m: 'post', p: '/import/{id}/cancel', tag: 'Importação', resumo: 'Cancela a prévia sem gravar nada', perm: 'import.manage' },

  { m: 'get', p: '/audit', tag: 'Auditoria e configurações', resumo: 'Log completo de auditoria (imutável)', perm: 'audit.view', q: [...PAG, ['userId', 'integer', ''], ['projetoId', 'integer', ''], ['modulo', 'string', ''], ['acao', 'string', ''], ['de', 'string', ''], ['ate', 'string', ''], ['busca', 'string', '']] },
  { m: 'get', p: '/audit/facets', tag: 'Auditoria e configurações', resumo: 'Módulos e ações disponíveis para filtro', perm: 'audit.view' },
  { m: 'get', p: '/settings/public', tag: 'Auditoria e configurações', resumo: 'Limites de prazo e inatividade' },
  { m: 'get', p: '/settings', tag: 'Auditoria e configurações', resumo: 'Configurações do sistema', perm: 'settings.manage' },
  { m: 'put', p: '/settings/{chave}', tag: 'Auditoria e configurações', resumo: 'Alterar configuração', perm: 'settings.manage', body: obj({ valor: int() }, ['valor']) },
];

export function buildOpenApi(versao: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of OPS) {
    const params = [
      ...(o.p.match(/\{(\w+)\}/g) ?? []).map((x) => ({ name: x.slice(1, -1), in: 'path', required: true, schema: x.includes('chave') ? S('string') : S('integer') })),
      ...(o.q ?? []).map(([name, tipo, description]) => ({ name, in: 'query', required: false, description, schema: S(tipo) })),
    ];
    (paths[o.p] ??= {})[o.m] = {
      tags: [o.tag], summary: o.resumo,
      description: o.perm ? `Permissão necessária: \`${o.perm}\`.` : o.p.startsWith('/auth') ? undefined : 'Requer sessão autenticada.',
      ...(params.length ? { parameters: params } : {}),
      ...(o.body ? { requestBody: { required: true, content: { 'application/json': { schema: o.body } } } } : {}),
      ...(o.multipart ? { requestBody: { required: true, content: { 'multipart/form-data': { schema: o.multipart } } } } : {}),
      responses: {
        '200': o.bin ? { description: o.bin, content: { '*/*': { schema: { type: 'string', format: 'binary' } } } } : { description: 'Sucesso', content: { 'application/json': { schema: { type: 'object' } } } },
        '401': { $ref: '#/components/responses/NaoAutenticado' }, '403': { $ref: '#/components/responses/SemPermissao' }, '422': { $ref: '#/components/responses/Invalido' },
      },
      ...(o.p.startsWith('/auth/login') || o.p.startsWith('/auth/forgot') || o.p.startsWith('/auth/reset') ? { security: [] } : {}),
    };
  }
  const erro = (d: string) => ({ description: d, content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } });
  return {
    openapi: '3.0.3',
    info: {
      title: 'Controle BSC — APD/UPD (URBS)', version: versao,
      description: [
        'API do sistema de controle e gestão de projetos BSC da APD/UPD.',
        '',
        '**Autenticação:** `POST /auth/login` define o cookie `bsc_token` (HttpOnly) e o cookie `bsc_csrf`. Em requisições que alteram dados (POST/PATCH/PUT/DELETE) envie o valor do cookie `bsc_csrf` no cabeçalho `X-CSRF-Token`.',
        '',
        '**Confidencialidade:** todas as consultas já filtram o que o usuário pode enxergar. Recursos fora do acesso respondem 404.',
        '',
        '**Paginação:** listas aceitam `page` e `pageSize` (máx. 200) e respondem `{ itens, total, page, pageSize }`.',
        '',
        '**Integração com Power BI:** veja as views `bi_*` do banco (docs/POWERBI.md).',
      ].join('\n'),
    },
    servers: [{ url: '/api' }],
    tags: [...new Set(OPS.map((o) => o.tag))].map((name) => ({ name })),
    security: [{ cookieAuth: [] }],
    paths,
    components: {
      securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'bsc_token' } },
      schemas: {
        Erro: obj({ erro: str(), detalhes: S('array', { items: obj({ campo: str(), mensagem: str() }) }) }),
        Pagina: obj({ itens: arr({ type: 'object' }), total: int(), page: int(), pageSize: int() }),
      },
      responses: { NaoAutenticado: erro('Sessão ausente ou expirada'), SemPermissao: erro('Sem permissão para a ação'), Invalido: erro('Dados inválidos') },
    },
  };
}
