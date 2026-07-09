import { Injectable } from '@angular/core';
import { GameStateStore } from '../../core/services/game-state.store';
import { GameEngineService, MoveOption } from '../../core/services/game-engine.service';
import { GraphMetricsService } from '../../core/services/graph-metrics.service';
import { GameGraphService } from '../../core/services/game-graph.service';
import { TransportType } from '../../core/enums/transport-type.enum';
import { TicketInventory, createDetectiveTickets, createMisterXTickets } from '../../core/models/ticket.model';
import { Detective, MisterXLogEntry } from '../../core/models/player.model';
import { AiDecision, DetectiveStrategy } from './strategy.types';

/**
 * ============================================================================
 * DETEKTIV-KI – STRATEGIE-ÜBERSICHT (siehe auch docs/detective-ai-strategy.md)
 * ============================================================================
 *
 * Phase A – Such-/Positionierungsphase (Mister X noch nie gesehen):
 *   Die Detektive kennen keine Position von Mister X. Sinnvollste Aktion:
 *   das Spielfeld gleichmäßig mit hoher Mobilität abdecken, damit man aus
 *   möglichst vielen Stationen in der nächsten Runde reagieren kann, sobald
 *   er sich zeigt. Dafür: Stationen mit hoher Degree-Centrality ansteuern,
 *   aber JEDEM Detektiv eine ANDERE Zielstation zuweisen (sonst würden alle
 *   zum selben "besten" Knoten laufen und das Feld bliebe an anderer Stelle
 *   ungedeckt).
 *
 * Phase B – Verfolgungsphase (Mister X wurde mind. einmal aufgedeckt):
 *   Aus der letzten bekannten Position + den seither vergangenen Runden +
 *   den nachweislich verbrauchten Tickets (aus der Fahrtentafel ablesbar,
 *   außer bei Black Tickets) wird eine "Wolke" plausibler aktueller
 *   Aufenthaltsorte berechnet. Die Detektive werden NICHT alle auf den
 *   nächstgelegenen Kandidaten gehetzt, sondern über mehrere Kandidaten
 *   verteilt (Einkesseln statt Pulk-Bildung).
 *
 * Phase C – Ressourcenmanagement (immer aktiv):
 *   Bei der Wahl des tatsächlichen NÄCHSTEN Einzelschritts wird nicht nur
 *   die reine Distanz zum Zielknoten betrachtet, sondern auch, wie knapp
 *   ein Verkehrsmittel im Ticket-Vorrat des jeweiligen Detektivs schon ist.
 *   Technisch als kleiner Aufschlag auf die Dijkstra-Kantengewichte gelöst
 *   (siehe scarcityCost()) – bei echten Distanzunterschieden gewinnt immer
 *   der kürzere Weg, bei GLEICH langen Wegen aber das Verkehrsmittel, von
 *   dem der Detektiv noch reichlich Tickets hat.
 * ============================================================================
 */
@Injectable({ providedIn: 'root' })
export class DetectiveAiStrategyService implements DetectiveStrategy {
  readonly id = 'detective-phase-abc-v1';
  readonly label = 'Phase A/B/C (Centrality → Dijkstra → Ticket-Balance)';
  readonly description =
    'Sucht bei Unwissenheit zentrale Knoten auf, verfolgt nach Auftauchen via Dijkstra ' +
    'mit Einkesselung, balanciert nebenbei den Ticket-Verbrauch.';

  /** Zielstation je Detektiv für die aktuelle Runde (einmal pro Runde geplant, siehe planRoundIfNeeded). */
  private roundAssignments = new Map<string, number>();
  private assignmentsPlannedForRound = -1;

  /** Referenz-Ticketmengen zu Rundenbeginn, um "Knappheit" relativ einzuschätzen (Phase C). */
  private readonly initialDetectiveTickets = createDetectiveTickets();

  constructor(
    private readonly store: GameStateStore,
    private readonly engine: GameEngineService,
    private readonly graph: GameGraphService,
    private readonly metrics: GraphMetricsService
  ) {}

  /**
   * Öffentlicher Haupteinstiegspunkt: liefert den nächsten Zug für einen
   * Detektiv inkl. Begründung, oder null, falls er keinen gültigen Zug hat
   * (dann sollte die aufrufende Stelle engine.skipDetectiveTurn() nutzen).
   */
  decideMove(detectiveId: string): AiDecision | null {
    this.planRoundIfNeeded();

    const state = this.store.gameState();
    const detective = state.detectives.find(d => d.id === detectiveId);
    if (!detective) return null;

    const validMoves = this.engine.getValidMovesForDetective(detectiveId);
    if (validMoves.length === 0) return null;

    const target = this.roundAssignments.get(detectiveId);
    if (target === undefined) {
      // Sollte nicht vorkommen (planRoundIfNeeded weist jedem Detektiv ein Ziel zu),
      // aber als Sicherheitsnetz: nimm den kürzesten verfügbaren Zug irgendeiner Richtung.
      return {
        move: validMoves[0],
        rationale: 'Kein Planungsziel vorhanden (Fallback) – nehme ersten gültigen Zug.'
      };
    }

    // 1-Schritt-Ausblick: für jeden aktuell gültigen Zug simulieren, wie nah man
    // dem Zielknoten danach wäre (siehe Kommentar am Funktionskopf weiter unten,
    // warum das robuster ist als reine Pfad-Rückverfolgung).
    let bestMove = validMoves[0];
    let bestScore = Infinity;
    let bestFutureDistance = Infinity;

    for (const move of validMoves) {
      const ticketsAfterMove = this.applyHypotheticalTicketUse(detective.tickets, move.transport);
      const futureDistances = this.metrics.dijkstra(
        move.to,
        ticketsAfterMove,
        (transport, tickets) => this.scarcityCost(transport, tickets)
      ).distances;
      const distanceToTarget = futureDistances.get(target) ?? Infinity;

      // Score = Kosten dieses Schritts (inkl. Knappheits-Aufschlag) + verbleibende Distanz danach.
      const stepCost = this.scarcityCost(move.transport, detective.tickets);
      const score = stepCost + distanceToTarget;

      if (score < bestScore) {
        bestScore = score;
        bestFutureDistance = distanceToTarget;
        bestMove = move;
      }
    }

    return {
      move: bestMove,
      rationale: this.buildRationale(detective, target, bestMove, bestFutureDistance, state)
    };
  }

  /** Erzwingt eine Neuplanung beim nächsten decideMove()-Aufruf (z. B. nach Spielstart/Reset). */
  invalidatePlan(): void {
    this.assignmentsPlannedForRound = -1;
    this.roundAssignments.clear();
  }

  // ---------------------------------------------------------------------
  // Rundenplanung (Ziel-Zuweisung) – einmal pro Runde, nicht pro Einzelzug
  // ---------------------------------------------------------------------

  private planRoundIfNeeded(): void {
    const state = this.store.gameState();
    if (this.assignmentsPlannedForRound === state.round && this.roundAssignments.size === state.detectives.length) {
      return;
    }
    this.assignmentsPlannedForRound = state.round;

    const lastKnown = this.findLastKnownMisterXPosition(state.misterX.moveLog);

    const candidates = lastKnown === null
      ? this.getPhaseATargets(state.detectives.length)
      : this.getPhaseBTargets(lastKnown, state.round);

    this.roundAssignments = this.assignDistinctTargets(state.detectives, candidates);
  }

  /**
   * Phase A: Kandidatenliste = Stationen mit hoher Degree-Centrality.
   * Wir holen bewusst MEHR Kandidaten als Detektive vorhanden sind (Faktor 4),
   * damit bei der Zuweisung noch Auswahl besteht und nicht zwei Detektive
   * zwangsläufig um denselben Top-Knoten konkurrieren.
   */
  private getPhaseATargets(detectiveCount: number): number[] {
    return this.metrics.getTopCentralStations(Math.max(detectiveCount * 4, 12));
  }

  /**
   * Phase B: "Wolke" plausibler aktueller Mister-X-Standorte, ausgehend von der
   * letzten bekannten Position.
   *
   * WICHTIG (Regel-Korrektur): Taxi/Bus/U-Bahn sind bei Mister X laut Anleitung
   * UNBEGRENZT verfügbar – anders als zunächst angenommen, kann er also NIE
   * durch fehlende reguläre Tickets eingeschränkt sein. Die Wolke muss daher
   * IMMER alle drei regulären Verkehrsmittel zulassen. Einzige relevante
   * Einschränkung: Das Boot ist nur erreichbar, wenn er nachweislich noch
   * mindestens ein Black Ticket haben könnte (siehe computeMisterXKnownRemainingTickets).
   */
  private getPhaseBTargets(
    lastKnown: { station: number; round: number },
    currentRound: number
  ): number[] {
    const hopsSinceReveal = Math.max(currentRound - lastKnown.round, 1);
    const remaining = this.computeMisterXKnownRemainingTickets();

    const allowedTransports = new Set([TransportType.Taxi, TransportType.Bus, TransportType.UBahn]);
    if (remaining.black > 0) {
      allowedTransports.add(TransportType.Boot);
    }

    const cloud = this.metrics.bfsReachableWithinHops(lastKnown.station, hopsSinceReveal, allowedTransports);
    return Array.from(cloud);
  }

  /**
   * Weist Detektiven distinkte Zielstationen zu (vereinfachte Greedy-Variante
   * des Zuordnungsproblems/"Assignment Problem" – eine echte Lösung wäre der
   * Ungarische Algorithmus, für 2-5 Detektive und wenige Dutzend Kandidaten
   * liefert Greedy aber praktisch gleichwertige Ergebnisse bei viel simplerem Code):
   *
   * 1. Für jede (Detektiv, Kandidat)-Kombination die Dijkstra-Distanz berechnen.
   * 2. Alle Paare nach Distanz aufsteigend sortieren.
   * 3. Der Reihe nach das jeweils NÄCHSTE Paar übernehmen, bei dem weder der
   *    Detektiv noch der Kandidat schon vergeben ist.
   *
   * Effekt: Der Detektiv mit der global kürzesten Distanz zu IRGENDEINEM
   * Kandidaten bekommt garantiert seinen besten Match; alle anderen werden
   * auf die verbleibenden Kandidaten verteilt – genau das verhindert, dass
   * mehrere Detektive zum selben Knoten rennen.
   */
  private assignDistinctTargets(detectives: Detective[], candidates: number[]): Map<string, number> {
    const assignment = new Map<string, number>();
    if (candidates.length === 0 || detectives.length === 0) return assignment;

    interface Pair { detectiveId: string; candidate: number; distance: number; }
    const pairs: Pair[] = [];

    for (const detective of detectives) {
      const distances = this.metrics.dijkstra(
        detective.position,
        detective.tickets,
        (transport, tickets) => this.scarcityCost(transport, tickets)
      ).distances;
      for (const candidate of candidates) {
        pairs.push({
          detectiveId: detective.id,
          candidate,
          distance: distances.get(candidate) ?? Infinity
        });
      }
    }

    pairs.sort((a, b) => a.distance - b.distance);

    const claimedCandidates = new Set<number>();
    const assignedDetectives = new Set<string>();

    for (const pair of pairs) {
      if (assignedDetectives.has(pair.detectiveId)) continue;
      if (claimedCandidates.has(pair.candidate)) continue;
      if (pair.distance === Infinity) continue;
      assignment.set(pair.detectiveId, pair.candidate);
      assignedDetectives.add(pair.detectiveId);
      claimedCandidates.add(pair.candidate);
    }

    // Randfall: mehr Detektive als (erreichbare) Kandidaten -> übrige Detektive
    // bekommen den jeweils nächstbesten Kandidaten zugewiesen, auch wenn der
    // schon vergeben ist (besser doppelt abgedeckt als gar kein Ziel).
    for (const detective of detectives) {
      if (assignedDetectives.has(detective.id)) continue;
      const fallback = pairs.find(p => p.detectiveId === detective.id && p.distance < Infinity);
      if (fallback) assignment.set(detective.id, fallback.candidate);
    }

    return assignment;
  }

  // ---------------------------------------------------------------------
  // Wissen über Mister X aus der (öffentlich sichtbaren) Fahrtentafel ableiten
  // ---------------------------------------------------------------------

  private findLastKnownMisterXPosition(log: MisterXLogEntry[]): { station: number; round: number } | null {
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].revealedStation !== null) {
        return { station: log[i].revealedStation as number, round: log[i].round };
      }
    }
    return null;
  }

  /**
   * Rekonstruiert aus der Fahrtentafel, wie viele Black Tickets Mister X
   * nachweislich noch übrig haben MUSS (Startbestand = Anzahl Detektive,
   * minus Anzahl bisheriger Runden ohne sichtbares Verkehrsmittel).
   *
   * WICHTIG (Regel-Korrektur): Taxi/Bus/U-Bahn werden hier NICHT mehr
   * mitgezählt – sie sind bei Mister X laut Anleitung unbegrenzt (er nutzt
   * implizit die von den Detektiven abgegebenen Tickets nach), können ihn
   * also nie einschränken. Nur der Black-Ticket-Bestand ist eine echte,
   * verlässliche Grenze und bleibt daher relevant für Phase B (Boot-Zugang).
   */
  private computeMisterXKnownRemainingTickets(): TicketInventory {
    const state = this.store.gameState();
    const detectiveCount = state.detectives.length;
    const initial = createMisterXTickets(detectiveCount);
    let usedBlack = 0;

    for (const entry of state.misterX.moveLog) {
      if (!entry.transportRevealed) {
        usedBlack++;
      }
    }

    return {
      ...initial,
      black: Math.max(initial.black - usedBlack, 0)
    };
  }

  // ---------------------------------------------------------------------
  // Phase C: Ticket-Balance als Kostenaufschlag im Dijkstra
  // ---------------------------------------------------------------------

  /**
   * Kosten einer Kante für Dijkstra: Grundkosten 1 (eine Fahrt), plus ein
   * kleiner Aufschlag, der wächst, je knapper dieses Verkehrsmittel im
   * Vorrat des Detektivs schon ist (relativ zu seinem Startkontingent).
   *
   * WICHTIG: Der Aufschlag ist bewusst klein (max. 0.3), damit er niemals
   * einen echten Umweg gegenüber einem kürzeren Weg attraktiver macht –
   * er entscheidet nur zwischen ANSONSTEN gleich guten Optionen. Ein
   * Unterschied von auch nur einer einzigen Fahrt (Kosten-Differenz 1.0)
   * dominiert immer über den maximalen Knappheits-Aufschlag von 0.3.
   */
  private scarcityCost(transport: TransportType, tickets: TicketInventory): number {
    if (transport === TransportType.Boot || transport === TransportType.Black) return 1;

    const initialCount = this.initialDetectiveTickets[transport];
    const remaining = tickets[transport];
    const scarcity = 1 - remaining / initialCount; // 0 = voller Vorrat, 1 = komplett aufgebraucht
    const penaltyWeight = 0.3;
    return 1 + Math.max(0, scarcity) * penaltyWeight;
  }

  private applyHypotheticalTicketUse(tickets: TicketInventory, transport: TransportType): TicketInventory {
    if (transport === TransportType.Boot || transport === TransportType.Black) return tickets;
    return { ...tickets, [transport]: Math.max(tickets[transport] - 1, 0) };
  }

  // ---------------------------------------------------------------------
  // Begründungstext für UI/Logs
  // ---------------------------------------------------------------------

  private buildRationale(
    detective: Detective,
    target: number,
    move: MoveOption,
    remainingDistance: number,
    state: ReturnType<GameStateStore['gameState']>
  ): string {
    const lastKnown = this.findLastKnownMisterXPosition(state.misterX.moveLog);
    const phaseLabel = lastKnown === null ? 'Phase A (Suche)' : 'Phase B (Verfolgung)';
    const reasonForTarget = lastKnown === null
      ? `Zielstation ${target} wurde wegen hoher Degree-Centrality (gute Feldabdeckung) zugewiesen`
      : `Zielstation ${target} liegt in der plausiblen Mister-X-Wolke um die zuletzt bekannte Position ${lastKnown.station} (Runde ${lastKnown.round})`;

    return `[${phaseLabel}] Detektiv ${detective.color}: ${reasonForTarget}. ` +
      `Fährt mit ${move.transport} nach ${move.to} (verbleibende geschätzte Distanz zum Ziel danach: ${remainingDistance}).`;
  }
}
