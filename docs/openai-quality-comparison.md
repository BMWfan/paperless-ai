# Isolierter OpenAI-Qualitätsvergleich

Basis ist Draft-PR #49 am verifizierten Stand
`6a7ee95c8f2c0e72e5807c06652ba3dc25f989ff`.
GitHub konnte `dfe217e82b8c` nicht auflösen.

Der Vergleich übernimmt Korpus, Ausgabeschema und Bewertung aus SPEC #20
und den gepaarten Vergleich aus SPEC #15. Für jedes der drei fixierten
Modell-Snapshots werden dieselben 20 deutschen und englischen
Confirmation-Fälle einmal ohne Kontext und einmal mit denselben zehn
separaten synthetischen Trainingsreferenzen ausgewertet. Die Referenzen
simulieren bestätigte Beispiele. Das misst Prompt- und Modellqualität
bei festem Kontext. Die produktive Auswahl von Referenzen und das
Schreiben von Metadaten sind außerhalb dieses Versuchs.

## Kosten und Ausführung

`node tests/quality/openai-compare.js` berechnet den Versuchsplan offline.
Der Vorabcheck ergab 120 sequenzielle Inferenzaufrufe und höchstens
0,378805 USD bzw. 0,757610 EUR als konservative Kalkulation. Die Rechnung
verwendet Standardtarife ohne Cache-Rabatt, die UTF-8-Größe jeder Anfrage
plus 2048 Tokens Reserve für Eingabe- und Schema-Overhead sowie maximal
1024 Ausgabetokens einschließlich Reasoning. Der Umrechnungsfaktor von
2 EUR pro USD ist eine Reserve für Wechselkurs und Zuschläge. Vor dem
einmaligen Lauf aktuelle Tarife und Abrechnungsbedingungen gegen diese
Annahmen prüfen. Das Limit basiert auf dem Versuchsplan und ist kein
anbieter- oder projektweites Abrechnungslimit.

Der bestehende Workflow **OpenAI bounded connection smoke check** hat
im lokalen Entwurf den zusätzlichen manuellen Schalter
`quality_comparison`. Der Testschritt erhält ausschließlich
`OPENAI_TEST_API_KEY` aus GitHub Secrets. Drei Modellabfragen prüfen
vorab den Zugriff auf die Snapshots. Die Aufrufliste ist fest, es gibt
keine Antwort-Retries. Die Workflow-Sperre serialisiert Läufe und
Wiederholungsversuche eines Runs sind gesperrt. Nur einmal neu
dispatchen. Vor einem weiteren Dispatch auch bei Abbruch zuerst den
Verbrauch und dokumentierte Reservierungen vom gemeinsamen Budget abziehen.

Der Entwurf ist lokal. Nach Veröffentlichung auf einem freigegebenen
Test-Ref den Workflow auf diesem Ref mit `quality_comparison=true`
einmal manuell starten. Das JSONL-Artefakt trägt die Run-ID und
enthält auch bei Abbruch die bis dahin geschriebenen Daten. Pro
Modell und Arm Treffer, fehlende und falsche Werte je Feld auswerten.
Positive Extraktion und korrekte Abwesenheit getrennt zählen.
Kopien von Trainingswerten und historischen Kennungen separat zählen.
Verweigerungen, abgeschnittene Antworten und unvollständige Läufe
gesondert ausweisen. Laufzeiten und Tokenkosten stehen pro Aufruf
im Artefakt. Ein erfolgreicher HTTP-Aufruf ist kein Qualitätsnachweis.
