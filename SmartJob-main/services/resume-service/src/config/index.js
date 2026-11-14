import '@smartjob/shared/config';
import { fileURLToPath } from 'node:url';
export const settings = () => ({
  port: Number(process.env.RESUME_PORT || 3005),
  database: process.env.RESUME_DB || 'smartjob_resumes',
  storageDir: process.env.RESUME_STORAGE_DIR || fileURLToPath(new URL('../../../../.local/resumes', import.meta.url)),
});
