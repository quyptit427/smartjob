const port = process.env.AI_PORT || '3006';
const token = process.env.INTERNAL_SERVICE_TOKEN || '';

for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    if (health.ok) {
      const response = await fetch(`http://127.0.0.1:${port}/internal/vectors/reindex`, {
        method: 'POST',
        headers: { 'x-service-token': token },
      });
      const body = await response.text();
      console.log(`vector reindex: ${response.status} ${body}`);
      process.exit(0);
    }
  } catch {
    // AI service is still booting.
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.log('vector reindex: ai-service chưa sẵn sàng, bỏ qua lần này');
