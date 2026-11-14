import axios from 'axios';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createBaseApp, finishApp } from '@smartjob/shared/server';
import { config } from '@smartjob/shared/config';
import { ApiError } from '@smartjob/shared/errors';

export function createApp() {
  const app = createBaseApp('api-gateway');
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
      },
    }),
  );
  app.use('/api/resumes', express.raw({ type: 'application/pdf', limit: '5mb' }));
  app.use(async (req, res, next) => {
    // Only these public namespaces can cross the gateway. Never forward service credentials.
    const match = req.path.match(/^\/api\/(auth|users|jobs|applications|recommendations|resumes|ai)(?:\/|$)/);
    if (!match || req.path.split('/').some((part) => part.toLowerCase() === 'internal'))
      return next(new ApiError(404, 'Không tìm thấy đường dẫn.', 'NOT_FOUND'));
    const service = {
      auth: 'user',
      users: 'user',
      jobs: 'job',
      applications: 'application',
      recommendations: 'recommendation',
      resumes: 'resume',
      ai: 'ai',
    }[match[1]];
    const settings = config();
    try {
      const response = await axios({
        method: req.method,
        url: `${settings.urls[service]}${req.originalUrl}`,
        data: req.body,
        timeout: service === 'ai' ? settings.aiTimeout : settings.gatewayTimeout,
        proxy: false,
        maxRedirects: 0,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        headers: {
          'content-type': req.headers['content-type'] || 'application/json',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
          ...(req.headers['x-file-name'] ? { 'x-file-name': req.headers['x-file-name'] } : {}),
        },
      });
      if (response.headers['content-type'])
        res.set('content-type', response.headers['content-type']);
      if (response.headers['content-disposition'])
        res.set('content-disposition', response.headers['content-disposition']);
      res.status(response.status).send(response.data);
    } catch (error) {
      next(
        new ApiError(
          error.code === 'ECONNABORTED' ? 504 : 503,
          `Dịch vụ ${service} chưa sẵn sàng. Vui lòng thử lại sau.`,
          'SERVICE_UNAVAILABLE',
        ),
      );
    }
  });
  return finishApp(app);
}
