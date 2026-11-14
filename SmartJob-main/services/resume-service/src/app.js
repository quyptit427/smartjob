import { createBaseApp, finishApp } from '@smartjob/shared/server';
import { routes } from './routes/index.js';
import { fileURLToPath } from 'node:url';

export function createApp({ storageDir = process.env.RESUME_STORAGE_DIR || fileURLToPath(new URL('../../../.local/resumes', import.meta.url)) } = {}) {
  const app = createBaseApp('resume-service', true);
  app.locals.resumeStorageDir = storageDir;
  app.use(routes);
  return finishApp(app);
}
