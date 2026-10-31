# Development rules

- Inspect architecture and existing implementation before changing code.
- Work only on the explicitly requested development branch; currently `feature/learning-engine-v2`. Never work on or push to main.
- Use the existing isolated checkout. Do not create worktrees unless explicitly requested.
- Integration tests must use `docker-compose.test.yml`, never a production Paperless instance or real documents/credentials.
- Start the stack with `docker compose -f docker-compose.test.yml up -d --build ai`; run `docker compose -f docker-compose.test.yml run --rm runner`.
- Reset only this stack with `docker compose -f docker-compose.test.yml down -v --remove-orphans`.
- Add meaningful automated coverage, run relevant tests before completion, investigate failures and explicitly report unrun tests and platform limitations.
- `npm test` starts nodemon. Use Node 22 and `node --test tests/*.test.js`, preferably via `docker compose -f docker-compose.test.yml run --rm --no-deps runner sh -c 'node --test tests/*.test.js'`. Host Node 24 has shown a native SQLite addon cleanup abort.
