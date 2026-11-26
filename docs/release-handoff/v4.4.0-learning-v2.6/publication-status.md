# Veröffentlichungsstand am 26. November 2026

- Der öffentliche Git-Tag `v4.4.0-learning-v2.6` ist annotiert und löst zu
  `6ceafca36419f877aea52c4342686d05c0dc621d` auf.
- Auf GitHub ist der Tag als [Prerelease veröffentlicht](https://github.com/BMWfan/paperless-ai/releases/tag/v4.4.0-learning-v2.6).
  Im [manuellen GHCR-Lauf 45563235974](https://github.com/BMWfan/paperless-ai/actions/runs/45563235974)
  auf `main` sind Preflight und Publish erfolgreich abgeschlossen.
- Der Versions- und SHA-Tag in GHCR zeigen auf denselben OCI-Index. Er enthält
  die Plattformen Linux AMD64 und ARM64 sowie zwei zugehörige Attestations-
  Manifeste. Der Release-Text dokumentiert, dass `latest` unverändert blieb.
- Das veröffentlichte Image wurde anhand des Digests gezogen und auf AMD64 mit
  leerem Datenvolume und deaktiviertem Netzwerk gestartet. Health meldete
  Version `4.4.0` und `not_configured`, die Session-API meldete erforderliches
  Erstsetup. Der getrennte Upgrade- und Restore-Test im Prüfbericht bezog
  sich auf den lokalen Kandidaten desselben Quell-Commits.

## Fest gepinnte Image-Referenz für Compose

```text
ghcr.io/bmwfan/paperless-ai:v4.4.0-learning-v2.6@sha256:4236977476113841eac26ebf9191fd814f84ed3a289515c21d869370d41c15c5
```

Offen für eine produktive Abnahme sind die Compose-Konfiguration der
Zielumgebung, das tatsächlich laufende Ausgangsimage mit Rollback-Digest, das
zielsystemspezifische Backup und die separate Deployment-Freigabe. Die
Übergabe dient der Vorbereitung der [Upgrade-Anleitung](upgrade-runbook.md).
