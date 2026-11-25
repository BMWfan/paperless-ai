# Paperless-AI v4.4.0-learning-v2.6

Prerelease candidate for BMWfan/paperless-ai at
`6ceafca36419f877aea52c4342686d05c0dc621d`.

## Changes since v4.4.0-learning-v2.5

- The dashboard reports the number of Paperless-ngx documents missing tags, a
  correspondent or a document type. The inventory opens paginated lists with
  links to the corresponding Paperless-ngx documents.
- The inventory requires a signed-in session. An unavailable count is displayed
  as unknown. The inventory reads metadata without generating model requests or
  changing documents.
- Integration and browser tests cover inventory counts, filtering and navigation.

[PR #56](https://github.com/BMWfan/paperless-ai/pull/56) · [Release comparison](https://github.com/BMWfan/paperless-ai/compare/v4.4.0-learning-v2.5...6ceafca36419f877aea52c4342686d05c0dc621d)

## Upgrade and rollback

For an existing 4.x installation, keep the current service, networks, environment
and complete `/app/data` mount. Stop Paperless-AI before taking a full data-volume
backup. Record the previous image digest and Compose configuration. Restore that
backup into an empty volume and start the previous image if rollback is needed.
Keep the older backup and image until the new installation has been accepted.

Registry publication and production deployment require separate owner approvals.
The app's internal version remains `4.4.0`; use the image tag, digest and commit
for release identification.
