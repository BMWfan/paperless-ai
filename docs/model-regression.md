# Modellregression für PRs

[SPEC #50](https://github.com/BMWfan/paperless-ai/issues/50) ergänzt die
normale CI um eine Offline-Prüfung des aktuellen Analyzers. Lokal nach
`npm ci` mit Node 22 starten:

```sh
node --import tsx e2e/model-regression.ts
```

Der Test verwendet zehn synthetische Prüffälle aus dem Confirmation-Split
von #20, zehn getrennte Trainingsbeispiele und feste Modelle
`gpt-4.1-mini-2025-04-14` und `gpt-5.4-mini-2026-03-17`. Er führt
Promptbau, Referenzauswahl, OpenAI-Adapter und Antwortnormalisierung
des geprüften Commits aus. Metadaten und bestätigte Beispiele kommen
aus lokalen Fixtures. Sprache wird nicht separat gewertet, weil die
aktuelle Analyzer-Ausgabe dafür kein Feld hat. Schreibsicherheit und
Paperless-ngx-Integration bleiben Gegenstand ihrer bestehenden Tests.

## Manueller Modelltest

Bei Änderungen an Prompt, Lernen oder Extraktion den Diff und alle
ausführbaren Abhängigkeiten des Repository-Refs prüfen. Deployments,
Fork-Refs und fremde PR-Commits sind hierfür ausgeschlossen.
Für einen freigegebenen Repository-Ref und dessen exakten Commit:

```sh
gh workflow run openai-credential-check.yml -R BMWfan/paperless-ai \
  --ref "$REVIEWED_REF" -f regression_sha="$REVIEWED_SHA" -f regression_live=true
```

Ohne `regression_live=true` führt diese Variante nur den Offline-Test
aus. Der Live-Schritt erhält `OPENAI_TEST_API_KEY` erst nach bestandener
Offline-Prüfung. Maximal 40 Anfragen, 768 Ausgabetokens je Anfrage und
17.048 konservativ kalkulierte Eingabetokens inklusive Schemareserve
ergeben 0,9716 EUR zum dokumentierten Standardtarif bei einem
Kalkulationsfaktor von 2 EUR je USD. Tarife vor Freigabe prüfen.
Pro Fall und Variante darf nur ein Request das Netzwerk erreichen.
Weitere Laufstarts gesondert freigeben und abrechnen.

Im Artefakt `model-regression-<run-id>` stehen SHA, Modellstände,
Korpusdigest, Soll und Ist, Bewertung, Laufzeit und Tokenverbrauch.
Nur vollständige, gepaarte Messungen für eine Qualitätsaussage
heranziehen. Ein Abbruch ist fehlende Messung. Korpus und Bewertung nach
#20 bleiben erhalten. Historische Qwen-Ergebnisse verbleiben im Archiv.
