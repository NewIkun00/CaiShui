import { Worker } from 'bullmq';
import { Redis } from 'ioredis';

const redisUrl = process.env['REDIS_URL'];
if (!redisUrl) throw new Error('REDIS_URL is required');

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const worker = new Worker(
  'ledgerly-jobs',
  (job) => {
    if (job.name === 'healthcheck') {
      return Promise.resolve({ ok: true, processedAt: new Date().toISOString() });
    }
    return Promise.reject(new Error(`Unsupported job type: ${job.name}`));
  },
  { connection },
);

worker.on('completed', (job) => console.info(JSON.stringify({ event: 'job.completed', jobId: job.id })));
worker.on('failed', (job, error) =>
  console.error(JSON.stringify({ event: 'job.failed', jobId: job?.id, message: error.message })),
);

async function shutdown(): Promise<void> {
  await worker.close();
  await connection.quit();
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
