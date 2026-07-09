# Mister-X-Fluchtstrategie – Design-Dokument

Begleitdokument zu `src/app/ai/strategies/mister-x-heuristic-strategy.service.ts`.

## Warum eine neue Strategie?

Die ursprüngliche Platzhalter-Strategie (`mister-x-naive-strategy.service.ts`)
maximiert nur die SUMME der Distanzen zu allen Detektiven. Das ist leicht
auszutricksen (4 Detektive weit weg + 1 direkt daneben ergibt trotzdem eine
hohe Summe) und berücksichtigt weder Sackgassen noch Ticket-Ökonomie. Die
Simulation (`dev-tools/ai-smoke-test.ts`) zeigte: Naive Strategie verliert in
~73% der Fälle innerhalb weniger Runden.

## Die vier Bewertungskriterien

Jeder mögliche Zug wird bewertet nach:

1. **Sicherheit** – Mindestabstand zum NÄCHSTEN Detektiv (nicht die Summe!),
   gewichtet mit `W_SAFETY = 3.0`.
2. **Bewegungsfreiheit** – Degree-Centrality der Zielstation (Sackgassen-
   Vermeidung), gewichtet mit `W_CENTRALITY = 0.15`.
3. **Ticket-Konservierung** – nur für Black Tickets relevant (siehe unten),
   gewichtet mit `W_SCARCITY = 1.0`.
4. **Verschleierung** – gezielter Einsatz von Black Tickets, wenn er die
   Sicherheit deutlich verbessert (`BLACK_USAGE_MARGIN = 1.5`) oder kurz vor
   einer Auftauch-Runde steht.

## Wichtige Regel-Korrektur während der Entwicklung

Die erste Version dieser Strategie ist in der Simulation regelmäßig "verhungert"
(kein gültiger Zug mehr ab Runde ~11-14). Grund: Taxi/Bus/U-Bahn-Tickets wurden
wie ein begrenztes Kontingent behandelt. Die Anleitung stellt aber klar:

> "Mister X stehen unbegrenzt Tickets zur Verfügung... Im weiteren Verlauf des
> Spiels verwendet er die Tickets, die die Detektive abgegeben haben."

Nur **Black Tickets** sind bei Mister X wirklich begrenzt (= Anzahl Detektive).
Dieser Fehler zog sich durch drei Stellen und wurde korrigiert:

- `GameEngineService`: kein Ticket-Bestandscheck mehr für Taxi/Bus/U-Bahn bei
  Mister X (nur die Kante muss existieren).
- `MisterXHeuristicStrategyService`: `scarcityPenalty()` gilt nur noch für
  Black Tickets.
- `DetectiveAiStrategyService`: Phase-B-Wolke geht jetzt davon aus, dass
  Taxi/Bus/U-Bahn IMMER verfügbar sind; nur der Boot-Zugang hängt noch vom
  geschätzten Black-Ticket-Restbestand ab.

## Sackgassen-Sperre (hasAnyContinuation)

Selbst mit unbegrenzten Taxi-Tickets bleibt ein Restrisiko: Ein Zug könnte
theoretisch auf eine Station führen, von der aus (mit den DANACH verbleibenden
Tickets) kein Folgezug mehr möglich wäre. `scoreDestination()` prüft das über
`hasAnyContinuation()` und bestraft solche Züge mit einem harten Abzug
(-1000) – als Sicherheitsnetz, auch wenn es nach der Regel-Korrektur in der
Praxis kaum noch vorkommen sollte (Taxi ist laut Anleitung an jeder Station
verfügbar).

## Doppelzug-Logik

`findBestDoubleMove()` durchsucht alle Kombinationen aus erstem + zweitem
Teilzug (inkl. Verkehrsmittelwechsel zwischen den beiden Teilzügen) und
vergleicht das Ergebnis gegen den besten Einzelzug. Nur wenn der Doppelzug um
mindestens `DOUBLE_MOVE_MARGIN = 2.5` Punkte besser abschneidet, wird er
eingesetzt – Doppelzüge sind mit nur 2 Karten ein knappes Gut.

## Ergebnis (siehe dev-tools/ai-smoke-test.ts, 30 Simulationen mit variierenden Startpositionen)

| Strategie | Detektive gewinnen | Mister X gewinnt | Ø Runden bis Fang |
|---|---|---|---|
| Naiv | 22/30 (73%) | 8/30 | 11.3 |
| Fluchtheuristik | 5/30 (17%) | 25/30 | 12.8 |

Ein deutlich ernsthafterer Gegner für die Detektiv-KI, aber nicht unschlagbar –
gute Grundlage, um als Nächstes an der Detektiv-Seite weiterzuarbeiten.

## Bekannte Grenzen / nächste Schritte

- Kein Modell für "wo stehen die Detektive in 2-3 Zügen", nur Momentaufnahme.
- Keine explizite Sackgassen-WAHRSCHEINLICHKEIT für die eigene Zukunft (nur
  der harte Continuation-Check, keine gestaffelte Bewertung).
- Schwellenwerte (Margins, Gewichte) sind von Hand gewählt, nicht optimiert –
  ließe sich später z. B. per Selbstspiel-Tuning verbessern.
