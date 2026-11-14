import express, { Router } from 'express';
import { authenticate, authorize, internalAuth } from '@smartjob/shared/auth';
import { validateId } from '@smartjob/shared/validation';
import * as controller from '../controllers/resumeController.js';

export const routes = Router();
routes.use('/api/resumes', express.raw({ type: 'application/pdf', limit: '5mb' }));
routes.get('/api/resumes/me', authenticate, authorize('CANDIDATE'), controller.get);
routes.put('/api/resumes/me', authenticate, authorize('CANDIDATE'), controller.upload);
routes.get('/api/resumes/me/file', authenticate, authorize('CANDIDATE'), controller.download);
routes.delete('/api/resumes/me', authenticate, authorize('CANDIDATE'), controller.remove);
routes.get('/internal/resumes/:id/file', internalAuth, validateId(), controller.internalDownload);
