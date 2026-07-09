# Scotland Yard – spielbarer Prototyp mit austauschbaren KI-Strategien (Angular)

## Neu in dieser Ausbaustufe

### 1. Ernsthafte Mister-X-Fluchtstrategie

`src/app/ai/strategies/mister-x-heuristic-strategy.service.ts` – Design-Doku in
`docs/mister-x-strategy.md`. Kurzfassung: bewertet jeden Zug nach Mindestabstand
zum nächsten Detektiv, Sackgassen-Vermeidung (Degree-Centrality), Black-Ticket-
Konservierung und setzt Black/Doppelzug gezielt zur Verschleierung ein. Ergebnis
in der Simulation: Detektiv-Siegquote sinkt von 73% (naive Strategie) auf 17%.

**Wichtiger Nebenfund beim Testen**: Die Simulation deckte einen Regelfehler
auf – Mister X hat laut Anleitung UNBEGRENZTE Taxi/Bus/U-Bahn-Tickets (nur
Black ist begrenzt). War in der Engine falsch umgesetzt und wurde korrigiert
(Details in `docs/mister-x-strategy.md`).

### 2. Strategie-Wechsel (auch mitten im Spiel)

`src/app/ai/strategies/ai-strategy-registry.service.ts` verwaltet alle
verfügbaren Strategien pro Seite. Im Spiel erscheint oben ein Dropdown für die
Seite, die gerade von der KI gespielt wird ("Detektiv-KI:" bzw. "Mister-X-KI:"),
jederzeit umschaltbar – auch während einer laufenden Partie. Neue Strategien
lassen sich einfach in der Registry ergänzen (Interface in `strategy.types.ts`),
ohne dass UI oder GameComponent etwas von der konkreten Implementierung wissen
müssen.

### 3. Spielfiguren stehen jetzt korrekt AUF den Stationen

Pixel-Analyse der PNG-Grafiken ergab: Es sind Pin-Marker (Kreis-Kopf + nach
unten auslaufender Schatten), deren Boden-Kontaktpunkt am UNTEREN Bildrand
liegt – nicht in der Bildmitte, wie die ursprünglich mitgelieferten
`offset_x/offset_y`-Werte nahelegten. `BoardComponent` verankert Figuren jetzt
selbst (bottom-center), siehe Kommentar in `board.component.ts`.

### 4. Neues Layout: Overlay-Panels + Zoom/Pan

Das Spielbrett nimmt jetzt den GESAMTEN verfügbaren Platz ein (volle Höhe/
Breite des Fensters). Ticket-Anzeige/Steuerung und Fahrtentafel/KI-Log schweben
als ein-/ausklappbare Overlay-Karten darüber, statt permanent Breite zu belegen.
Zusätzlich: **Scroll zum Zoomen** (zum Mauszeiger hin) und **Ziehen zum
Verschieben** direkt auf dem Brett – bei 199 eng beieinanderliegenden Stationen
auf einem Notebook-Bildschirm ein spürbarer Unterschied. Zoom-Buttons (+/−/⟲)
unten rechts auf dem Brett als Alternative zum Scrollrad.

## Schnellstart

```bash
cd scotland-yard
npm install
npm start
```

## Bedienung

1. **Setup**: Spielplan, Rolle, Sichtbarkeits-Modus, Anzahl Detektive,
   Startpositionen wählen.
2. **Im Spiel**: Oben rechts erscheint (je nach Rolle) ein Dropdown zur Wahl
   der KI-Strategie der Gegenseite. Brett per Scrollrad zoomen, per Ziehen
   verschieben. Ticket-/Zug-Steuerung links oben, Fahrtentafel/KI-Log rechts
   oben – beide Panels über den Titel-Button ein-/ausklappbar.
3. Ist der Mensch am Zug: Verkehrsmittel wählen → erreichbare Stationen
   erscheinen als klickbare Marker auf dem Plan.
4. Ist die KI am Zug: automatischer Zug nach kurzer Verzögerung (700ms,
   `AI_MOVE_DELAY_MS` in `game.component.ts`), Begründung im KI-Log.

## Architektur-Überblick (aktualisiert)

```
src/app/
├── ai/
│   └── strategies/
│       ├── strategy.types.ts                    # gemeinsame Interfaces (DetectiveStrategy, MisterXStrategy)
│       ├── ai-strategy-registry.service.ts       # zentrale Verwaltung + Live-Wechsel
│       ├── detective-ai-strategy.service.ts      # Phase A/B/C (siehe docs/detective-ai-strategy.md)
│       ├── mister-x-naive-strategy.service.ts    # einfache Baseline
│       └── mister-x-heuristic-strategy.service.ts # ernsthafte Fluchtstrategie (siehe docs/mister-x-strategy.md)
├── core/
│   ├── models/ · data/ · enums/
│   └── services/
│       ├── game-graph.service.ts    # Graph, Stationen, Pawn-Offsets (Rohdaten, aktuell ungenutzt für Pawn-Rendering)
│       ├── game-state.store.ts      # Signal-State inkl. humanRole/devOptions
│       ├── game-engine.service.ts   # Regeln, Zugvalidierung/-ausführung
│       └── graph-metrics.service.ts # Degree-Centrality, Dijkstra, BFS-Wolke
└── features/
    ├── board/        # SVG-Spielplan, jetzt mit Zoom/Pan, korrekter Pawn-Verankerung
    ├── ticket-panel/ · move-log/ · player-hud/ · setup/
    └── game/         # Orchestrierung, neues Overlay-Layout

docs/
├── detective-ai-strategy.md   # Pseudocode Detektiv-Strategie
└── mister-x-strategy.md       # Design-Doku Fluchtstrategie + Regel-Korrektur

dev-tools/
├── smoke-test.ts       # Graph-/Engine-Logiktest ohne Angular-Runtime
└── ai-smoke-test.ts    # Simulation: Detektiv-KI vs. wahlweise Naiv- oder Fluchtheuristik-Mister-X,
                          jetzt mit variierenden Startpositionen für aussagekräftige Statistik
```

## Bekannte Vereinfachungen (unverändert bzw. aus vorherigen Ausbaustufen)

- **Keine Sichtschutz-Mechanik zwischen Menschen** (nur relevant für Hotseat
  mit mehreren menschlichen Spielern, nicht für Mensch-vs-KI).
- **Startkarten-Nummern**: zufällig, aber im Setup frei editierbar.
- **9 korrigierte Verbindungen**: siehe `src/app/core/data/connections-corrections.ts`.
- **Encirclement der Detektiv-KI ist Greedy, nicht optimal** (siehe
  `docs/detective-ai-strategy.md`).

## Für die nächste Ausbaustufe

- Weitere Detektiv-Strategien zum Vergleich (aktuell nur eine implementiert,
  Registry ist aber schon darauf vorbereitet).
- Mister-X-Heuristik könnte mehrstufig vorausschauen (aktuell nur 1-Schritt-
  bzw. 2-Schritt-Ausblick beim Doppelzug).
- Mobile/Touch-Optimierung des Zoom/Pan (aktuell auf Maus/Trackpad ausgelegt).

