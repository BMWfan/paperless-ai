# Native Paperless-ngx AI coexistence experiment

SPEC [#17](https://github.com/BMWfan/paperless-ai/issues/17), EPIC #12.
Baseline is Paperless-ngx 3.4.2, not an unmerged upstream branch.
Native AI remains disabled in `docker-compose.test.yml` and all existing user
configuration. This change adds opt-in test infrastructure, not a production
suggestion adapter or an assertion of better classification.

## Contract and ordered tasks

1. Verify upstream versioned configuration, `DocumentViewSet.ai_suggestions`,
   workflow API tests and action enum (AI suggestions = 8, added = 2, updated = 3).
2. Run disabled baseline, then enable a separate internal-only native AI overlay.
3. Use real local generation/embeddings, record model digests, compare suggestions
   without applying them, then native workflow writes on disjoint fields.
4. Test an overlapping field change: unknown source, pending review, no active
   example before explicit review. Disable that workflow before review.
5. Combine an explicit manual field update with a deterministic native updated
   workflow assigning a different title. Capture requested fields, returned
   document, freshly fetched document and learning events. A workflow-owned title
   must not silently become a confirmed human reference.
6. Test implicit ancestor tags added by ngx after an explicit child-tag update;
   an automatic parent must not count as explicitly confirmed feedback.
7. Reproduce any failure before proposing a production writer change; document
   the compatibility decision and add meaningful regression coverage first.
8. Review evidence/limits, pin discovered model manifests, then request owner
   merge approval. No production deployment or default activation.

## Reusable isolated profile

Use a separate project; do not reuse the standard test volumes or a production
stack. The dedicated workflow performs these steps and uploads the report:

```sh
export COMPOSE_PROJECT_NAME=paperless-ai-native-e2e
export TEST_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
docker compose -f docker-compose.test.yml up -d --build --wait ai
docker compose -f docker-compose.test.yml run --rm -e NATIVE_PROFILE=disabled runner node --test tests/e2e/native-ai.test.js
docker compose -f docker-compose.test.yml -f docker-compose.native-ai.yml up -d --build --wait ai native-model
docker compose -f docker-compose.test.yml -f docker-compose.native-ai.yml run --no-deps --build --name paperless-native-check native-check
docker cp paperless-native-check:/app/data/native-ai-report.json ./native-ai-report.json
# Reset only this explicitly named synthetic project:
docker compose -f docker-compose.test.yml -f docker-compose.native-ai.yml down -v --remove-orphans
```

The overlay uses Ollama 0.12.6, qwen2.5:0.5b generation and all-minilm:22m
embeddings. Downloads happen during image build; inference has no external
network. The model manifests observed in the first successful real run 43110533740 are
locked in tests/e2e/native-models.sha256. The image build verifies these checksums
after downloading, and the runtime test verifies API digests again. A changed
versioned tag therefore fails rather than silently using different weights.
The expanded ancestor test and final locked-model run still require qualification.

The managed 8-GB vfs runtime retains the compact baseline stack and synthetic
volumes. This additional Ollama image/build is deliberately run on its isolated
CI runner to avoid filling that local filesystem. This does not establish that
the extended image fits the 8-GB runtime. No broad Docker cleanup is needed.

## Writer matrix and provenance

| Profile | Native writer | Fork writer | Learning policy |
| --- | --- | --- | --- |
| Disabled | None | Existing baseline behavior | Existing tests |
| Read-only | Suggestions endpoint only | None | No metadata change or learning event |
| Disjoint | Added-workflow title only | Explicit manual custom-field update | No automatic fork scan competes for title |
| Overlap (negative) | Updated-workflow title | Monitor observes only | Unknown/pending; explicit review required |
| Manual + workflow (negative) | Deterministic updated-workflow title | Explicit document-type update | Unrequested native title cannot become automatically confirmed |

The disjoint experiment scopes actual requests, not a new persistent field-owner
configuration. Do not infer global conflict prevention from it. An administrator
must configure non-overlapping automatic writers per field/workflow. Native
workflow execution is asynchronous; the fork has no external atomic PATCH/CAS
contract. It cannot prove human origin from a changed metadata value alone.
A manual custom-field confirmation also remains a document-level learning
reference under the existing architecture; this experiment does not add per-field
provenance storage or migrate existing examples.

## Evidence and rollback

Initial discovery run 43110533740 at c73e045 passed the disabled, read-only,
disjoint, overlapping-write and manual/workflow cases. The suspected manual
response defect did not reproduce in that run, so no production writer was
changed. This is historical evidence: the expanded ancestor test and locked-model
head still require their own successful runtime run. Reports record real API metadata/events and model digests. A failed
provenance assertion is a reproduced defect to investigate, not a green result
or permission to weaken the assertion. No production fix is claimed yet.

Disable/delete experiment workflows, stop this project and remove only its
synthetic volumes, then use the base Compose file alone with fresh volumes.
No production data/config migration. Existing Learning Engine settings, review
flow and compatibility remain unchanged in the initial test-only diff.

Upstream source references (v3.4.2):
[configuration](https://github.com/paperless-ngx/paperless-ngx/blob/v3.4.2/docs/configuration.md#ai),
[views](https://github.com/paperless-ngx/paperless-ngx/blob/v3.4.2/src/documents/views.py),
[workflow API tests](https://github.com/paperless-ngx/paperless-ngx/blob/v3.4.2/src/documents/tests/test_api_workflows.py),
[AI workflow executor](https://github.com/paperless-ngx/paperless-ngx/blob/v3.4.2/src/documents/workflows/ai.py).
