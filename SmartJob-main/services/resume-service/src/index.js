import { createApp } from './app.js';
import { settings } from './config/index.js';
import { startService } from '@smartjob/shared/server';

const service = settings();
startService(createApp({ storageDir: service.storageDir }), {
  port: service.port,
  database: service.database,
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
