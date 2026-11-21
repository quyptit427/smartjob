import { config } from '@smartjob/shared/config';

const enabled = () => Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);

const plainJob = (job) => {
  const source = typeof job.toObject === 'function' ? job.toObject({ versionKey: false }) : { ...job };
  return { ...source, _id: String(source._id) };
};

async function send(path, options) {
  if (!enabled()) return;
  const settings = config();
  try {
    const response = await fetch(`${settings.urls.ai}${path}`, {
      ...options,
      headers: {
        'x-service-token': settings.internalToken,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) console.error(`Vector sync ${path} failed: HTTP ${response.status}`);
  } catch (error) {
    console.error(`Vector sync ${path} failed: ${error.message}`);
  }
}

export const indexJob = (job) =>
  send('/internal/vectors/jobs', { method: 'POST', body: JSON.stringify(plainJob(job)) });

export const removeJobVector = (id) => send(`/internal/vectors/jobs/${id}`, { method: 'DELETE' });
