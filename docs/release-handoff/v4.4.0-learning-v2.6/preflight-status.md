# Offene Live-Prüfungen für v4.4.0-learning-v2.6

Stand 25. November 2026. Kandidat und aktuelles GitHub-main
`6ceafca36419f877aea52c4342686d05c0dc621d`.

- Der annotierte Tag liegt lokal vor. Das Git-Bundle wurde in ein neues leeres
  Repository importiert. Das getaggte Commit und der annotierte Tag wurden
  dort verifiziert. `git ls-remote` bestätigt, dass der Tag auf GitHub fehlt.
- Der Cloud-Proxy lehnt den HTTPS-Tunnel zu `api.github.com` mit 403 ab, bevor
  GitHub eine HTTP-Antwort liefern kann. Die Zusatzdomain konnte wegen des
  gesperrten Umgebungsentwurfs nicht gespeichert werden. Die JSON-Datei
  enthält die vorgeschlagene additive Freigabe für diese Umgebung.
- `manifest unknown` wurde für beide Image-Tags beobachtet. Der geschützte
  Workflow muss die Verfügbarkeit mit seinem eigenen Registry-Token prüfen.
  Das Ergebnis dieser Abfrage ist noch offen.
- Die am exakten SHA erfolgreichen Push-Läufe sind
  [CI](https://github.com/BMWfan/paperless-ai/actions/runs/45339922946) und
  [Learning-Integration](https://github.com/BMWfan/paperless-ai/actions/runs/45339923068).

## Lesende Abfragen in einer vorhandenen GitHub-Owner-Sitzung

Prüfe den alleinigen Reviewer BMWfan, die einzige Branch-Regel `main` und den
Publikationsschalter. Die zuvor festgelegten Environment-Vorgaben erlauben
Self-Review und untersagen den Administrator-Bypass.

```bash
gh api repos/BMWfan/paperless-ai/environments/ghcr-release \
  --jq '{name, can_admins_bypass, deployment_branch_policy, protection_rules}'
gh api repos/BMWfan/paperless-ai/environments/ghcr-release/deployment-branch-policies \
  --jq '.branch_policies[] | {name, type}'
gh api repos/BMWfan/paperless-ai/actions/variables/GHCR_PUBLISH_ENABLED --jq '.value'
```

Eine erfolgreiche Abfrage in der Owner-Sitzung bestätigt die Einstellungen.
Die Leserechte des konkreten Actions-Job-Tokens bleiben eine eigene Prüfung.

Der vorhandene Workflow hat keinen eigenständigen Preflight-Modus. Ein
erfolgreicher Preflight führt den Lauf bis zur Freigabe des Publish-Jobs.
Der Tag-Push und die Workflow-Auslösung benötigen eine gesonderte Freigabe.
Die vorgesehenen Eingaben sind der obige Tag und SHA sowie `latest=false`.
