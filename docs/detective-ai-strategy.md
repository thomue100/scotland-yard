# Detektiv-KI-Strategie – Design-Dokument

Begleitdokument zur Implementierung in `src/app/ai/detective-ai-strategy.service.ts`.
Zeigt die Entscheidungslogik auf Pseudocode-Ebene, unabhängig von TypeScript-Details.

## Klassenstruktur

```
DetectiveAiStrategyService
├── decideMove(detectiveId) -> AiDecision | null      // Haupteinstiegspunkt, 1x pro Detektiv-Zug
├── invalidatePlan()                                   // Reset bei Spielstart/Neustart
│
├── planRoundIfNeeded()            // private, 1x pro Runde (nicht pro Einzelzug!)
│   ├── findLastKnownMisterXPosition(log)
│   ├── getPhaseATargets(detectiveCount)    // falls Mister X noch nie gesehen
│   ├── getPhaseBTargets(lastKnown, round)  // falls schon mind. 1x aufgetaucht
│   └── assignDistinctTargets(detectives, candidates)
│
├── computeMisterXKnownRemainingTickets()  // aus Fahrtentafel rekonstruiert
├── scarcityCost(transport, tickets)       // Phase C: Ticket-Balance als Dijkstra-Gewicht
└── buildRationale(...)                    // Klartext-Begründung fürs Log
```

Abhängigkeiten (Dependency Injection): `GameStateStore` (Zustand lesen),
`GameEngineService` (gültige Züge, niemals direkt State schreiben),
`GameGraphService` (Rohgraph), `GraphMetricsService` (Degree-Centrality, Dijkstra, BFS-Wolke).

## Ablauf pro Detektiv-Zug (decideMove)

```
FUNCTION decideMove(detectiveId):
    planRoundIfNeeded()  // no-op, falls für diese Runde schon geplant

    detective = state.detectives[detectiveId]
    validMoves = engine.getValidMovesForDetective(detectiveId)
    IF validMoves ist leer:
        RETURN null  // Aufrufer soll skipDetectiveTurn() nutzen

    target = roundAssignments[detectiveId]

    // 1-Schritt-Ausblick: für jeden JETZT gültigen Zug simulieren,
    // wie die Distanz zum Ziel danach aussähe.
    bestMove = null
    bestScore = +Unendlich
    FOR EACH move IN validMoves:
        ticketsDanach = ticket(move.transport) - 1
        distanzDanach = dijkstra(move.to, ticketsDanach).distanceTo(target)
        score = kostenDiesesSchritts(move.transport) + distanzDanach
        WENN score < bestScore:
            bestScore = score
            bestMove = move

    RETURN { move: bestMove, rationale: "..." }
```

**Warum 1-Schritt-Ausblick statt Pfad-Rückverfolgung?**
Ein einfacher Dijkstra von der aktuellen Position aus liefert zwar den optimalen
Gesamtpfad, aber dessen ersten Schritt zu extrahieren ignoriert, dass andere
Detektive Stationen blockieren können (auf einem Punkt darf nur eine Figur
stehen). `engine.getValidMovesForDetective()` kennt diese Regel bereits – daher
bewerten wir lieber JEDEN aktuell tatsächlich erlaubten Zug einzeln neu, statt
uns auf einen theoretischen Pfad zu verlassen, der an einer Blockade scheitern
könnte.

## Phase A – Positionierung (Pseudocode)

```
FUNCTION getPhaseATargets(detectiveCount):
    // Deutlich mehr Kandidaten als Detektive anfordern, damit bei der
    // Zuweisung noch echte Auswahl besteht (Faktor 4).
    RETURN topNStationsByDegreeCentrality(max(detectiveCount * 4, 12))
```

Degree-Centrality = Anzahl ausgehender Kanten einer Station (über alle
Verkehrsmittel gezählt). Eine Station mit Taxi+Bus+U-Bahn-Anschluss zu 5
Nachbarn zählt höher als eine mit nur Taxi zu denselben 5 Nachbarn – mehr
Verkehrsmittel-Optionen bedeuten mehr taktische Flexibilität.

## Phase B – Verfolgung (Pseudocode)

```
FUNCTION getPhaseBTargets(lastKnown, currentRound):
    hopsSeitAuftauch = currentRound - lastKnown.round
    bekannteTickets  = computeMisterXKnownRemainingTickets()  // aus Fahrtentafel

    WENN bekannteTickets.black > 0:
        erlaubteVerkehrsmittel = ALLE (Taxi, Bus, U-Bahn, Boot)
        // Grund: Black Ticket kann JEDES Verkehrsmittel ersetzen,
        // Einschränkung nach Typ wäre daher falsch/zu optimistisch für die Detektive.
    SONST:
        erlaubteVerkehrsmittel = { t : bekannteTickets[t] > 0 }

    RETURN bfsReachableWithinHops(lastKnown.station, hopsSeitAuftauch, erlaubteVerkehrsmittel)
```

**Ticket-Tracking aus der Fahrtentafel:** Jede Zeile mit sichtbarem Verkehrsmittel
(alles außer Black-Ticket-Runden) verrät ein verbrauchtes Ticket. Ausgehend vom
bekannten Startkontingent (4 Taxi / 3 Bus / 3 U-Bahn / N Black) lässt sich so exakt
rekonstruieren, was noch übrig sein MUSS – echtes Wissen aus öffentlich sichtbaren
Informationen, kein Rätselraten.

## Encirclement / Zuweisung (Pseudocode)

```
FUNCTION assignDistinctTargets(detectives, candidates):
    pairs = []
    FOR EACH detective:
        distances = dijkstra(detective.position, detective.tickets)
        FOR EACH candidate:
            pairs.append({ detective, candidate, distance: distances[candidate] })

    SORT pairs BY distance ASCENDING

    zugewiesen = {}
    belegteKandidaten = {}
    FOR EACH pair IN pairs (aufsteigend sortiert):
        WENN pair.detective bereits zugewiesen: skip
        WENN pair.candidate bereits belegt: skip
        zugewiesen[pair.detective] = pair.candidate
        belegteKandidaten.add(pair.candidate)

    RETURN zugewiesen
```

Das ist ein **Greedy-Approximationsalgorithmus** für das klassische
Zuordnungsproblem (Assignment Problem). Der Ungarische Algorithmus (Kuhn-Munkres)
würde die global optimale Zuordnung garantieren, ist aber deutlich komplexer zu
implementieren. Bei 2–5 Detektiven und wenigen Dutzend Kandidatenstationen liefert
Greedy in der Praxis nahezu identische Ergebnisse: Der Detektiv mit dem global
kürzesten Weg zu IRGENDEINEM Kandidaten bekommt garantiert sein bestes Ziel, alle
anderen verteilen sich auf die verbleibenden Kandidaten. Genau das verhindert,
dass mehrere Detektive zum selben Knoten rennen ("Pulkbildung").

## Phase C – Ticket-Balance (Pseudocode)

```
FUNCTION scarcityCost(transport, tickets):
    WENN transport IN {Boot, Black}: RETURN 1  // betrifft Detektive ohnehin nicht

    anteilVerbraucht = 1 - (tickets[transport] / startkontingent[transport])
    RETURN 1 + anteilVerbraucht * 0.3   // max. 30% Aufschlag, NIE mehr als 1 ganze Fahrt
```

Diese Kosten fließen direkt als Kantengewicht in den Dijkstra ein (statt eines
separaten Nachbearbeitungsschritts). Der Effekt: Bei zwei ansonsten gleich
langen Wegen wird der mit dem noch reichlicheren Verkehrsmittel bevorzugt. Ein
echter Distanzunterschied von auch nur einer Fahrt (Gewichtsdifferenz 1.0)
dominiert aber IMMER über den maximalen Knappheits-Aufschlag (0.3) – Ticket-
Balance entscheidet also nur zwischen gleichwertigen Optionen, verschlechtert
nie den eigentlichen Verfolgungserfolg.

## Bekannte Vereinfachungen dieser Ausbaustufe

- **Encirclement ist Greedy, nicht optimal** (siehe oben) – für 2-5 Detektive
  in der Praxis ausreichend.
- **Phase-B-Wolke ignoriert Sackgassen-Logik**: Sie geht von "worst case,
  Mister X bewegt sich in jede Richtung" aus, ohne z. B. auszuschließen, dass
  er in eine Sackgasse gelaufen sein könnte (was ihn einschränken würde).
  Spätere Ausbaustufe: Wolke zusätzlich mit Backtracking-Wahrscheinlichkeit
  gewichten.
- **Kein Blick auf gegnerische Doppelzüge/Black-Ticket-Timing**: Die
  Detektiv-KI reagiert rein auf sichtbare Informationen, plant aber nicht
  vorausschauend, dass Mister X kurz vor einer Auftauch-Runde eher ein Black
  Ticket einsetzen könnte, um die Aufdeckung zu verschleiern.
- **Mister-X-Gegenstrategie ist nur ein Platzhalter** (`MisterXNaiveStrategyService`) –
  maximiert simpel die Summe der Distanzen zu allen Detektiven, ohne
  Sackgassen, Ticket-Timing oder Bluffs. Für aussagekräftige Tests der
  Detektiv-KI sollte hier als Nächstes eine ernsthafte Gegenstrategie
  entstehen, sonst gewinnen die Detektive zu leicht (siehe Simulationsergebnis:
  20/20 Siege in `dev-tools/ai-smoke-test.ts`).
