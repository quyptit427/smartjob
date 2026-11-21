# Embeddings in this repo are local 256-dimension vectors (ai-service/app/services/openai_client.py).
# The Vectorize index must use the same size. Run once after `wrangler login`.
npx wrangler vectorize create smartjob-jobs --dimensions=256 --metric=cosine
npx wrangler vectorize create-metadata-index smartjob-jobs --property-name=status --type=string
