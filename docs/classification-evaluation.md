# Synthetic classification evaluation

Use a fresh isolated Compose test project. The evaluation uses the same ten
held-out German and English documents in both phases. Five separate synthetic
training references are reviewed between phases. Ollama runs on the internal
network using the pinned container version. Only the image build downloads
public model weights.

```sh
docker compose -f docker-compose.test.yml --profile extended up -d --build --wait ai real-model
docker compose -f docker-compose.test.yml --profile extended run --no-deps --build --name paperless-ai-evaluation model-check
docker cp paperless-ai-evaluation:/app/data/real-model-evaluation.json ./real-model-evaluation.json
docker compose -f docker-compose.test.yml --profile extended down -v --remove-orphans
```

Follow the [test environment guide](test-environment.md) for the trusted CA
bundle and clean test project. The dedicated GitHub workflow uploads the report.
The report records the model and digest, generation options and fixed seed,
corpus digest, runtime, and each expected and actual value. Type, tags,
correspondent and language are scored as correct, wrong or missing. Tag
comparison uses an exact case-insensitive set. A successful run verifies the
measurement and context delivery. The scores describe this small local model
and corpus and do not set a pass threshold for classification accuracy.
