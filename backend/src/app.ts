import { createRequire } from 'node:module';
import { buildOpenApi } from './openapi.js';
import { importRouter } from './routes/import.js';
import { reportsRouter } from './routes/reports.js';
import { documentsRouter } from './routes/documents.js';
import { occurrencesRouter } from './routes/occurrences.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { errorHandler } from './lib/http.js';
import { authenticate, blockIfMustChange, csrf } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { usersRouter, rolesRouter } from './routes/users.js';
import { frentesRouter, lookupRouters } from './routes/lookups.js';
import { projectsRouter } from './routes/projects.js';
import { stagesRouter } from './routes/stages.js';
import { activitiesRouter } from './routes/activities.js';
import { movementsRouter } from './routes/movements.js';
import { notificationsRouter, alertsRouter } from './routes/notifications.js';
import { indicadoresRouter } from './routes/indicadores.js';
import { auditRouter, dashboardRouter, searchRouter, settingsRouter } from './routes/misc.js';

export const VERSAO = '0.6.0';
const swaggerAssets = () => createRequire(import.meta.url)('swagger-ui-dist').getAbsoluteFSPath() as string;

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'"], frameAncestors: ["'none'"] } } }));
  // Frontend (Vercel) e API (Render) em domínios diferentes: habilita CORS com credenciais para as origens configuradas.
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true, versao: VERSAO }));
  // Em produção, a documentação exige login (evita expor a estrutura da API publicamente).
  const docsGuard = config.isProd ? [authenticate] : [];
  api.get('/openapi.json', ...docsGuard, (_req, res) => res.json(buildOpenApi(VERSAO)));
  api.use('/docs/assets', ...docsGuard, express.static(swaggerAssets()));
  api.get('/docs/init.js', ...docsGuard, (_req, res) => res.type('js').send(`window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true, docExpansion: 'none', persistAuthorization: false, presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'StandaloneLayout',
    requestInterceptor: (r) => { const m = document.cookie.match(/(?:^|; )bsc_csrf=([^;]+)/); if (m && r.method !== 'GET') r.headers['X-CSRF-Token'] = m[1]; r.credentials = 'include'; return r; } });`));
  api.get('/docs', ...docsGuard, (_req, res) => res.type('html').send('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>API — Controle BSC</title><link rel="stylesheet" href="/api/docs/assets/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/assets/swagger-ui-bundle.js"></script><script src="/api/docs/assets/swagger-ui-standalone-preset.js"></script><script src="/api/docs/init.js"></script></body></html>'));
  api.use(csrf);
  api.use('/auth', authRouter);
  api.use(authenticate, blockIfMustChange);
  api.use('/users', usersRouter);
  api.use('/roles', rolesRouter);
  api.use('/frentes', frentesRouter);
  for (const l of lookupRouters) api.use(`/${l.path}`, l.router);
  api.use('/projects', projectsRouter);
  api.use('/stages', stagesRouter);
  api.use('/activities', activitiesRouter);
  api.use('/movements', movementsRouter);
  api.use('/audit', auditRouter);
  api.use('/settings', settingsRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/dashboard', indicadoresRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/alerts', alertsRouter);
  api.use('/documents', documentsRouter);
  api.use('/occurrences', occurrencesRouter);
  api.use('/reports', reportsRouter);
  api.use('/import', importRouter);
  api.use('/search', searchRouter);
  api.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use('/api', api);

  // Em produção o backend também serve o frontend compilado (um único serviço para publicar)
  const dist = path.resolve(process.cwd(), '../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
void config;
