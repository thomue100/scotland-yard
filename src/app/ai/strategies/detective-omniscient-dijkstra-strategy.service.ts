import { Injectable } from '@angular/core';
import { GameStateStore } from '../../core/services/game-state.store';
import { GameEngineService } from '../../core/services/game-engine.service';
import { GraphMetricsService } from '../../core/services/graph-metrics.service';
import { TicketInventory } from '../../core/models/ticket.model';
import { TransportType } from '../../core/enums/transport-type.enum';
import { AiDecision, DetectiveStrategy } from './strategy.types';

/**
 * ============================================================================
 * ALLWISSENDE DIJKSTRA-STRATEGIE – bewusster "Cheat-Modus"
 * ============================================================================
 *
 * Anders als DetectiveAiStrategyService (die Mister X' Position ausschließlich
 * aus der Fahrtentafel rekonstruiert, also den echten Fog-of-War respektiert)
 * greift diese Strategie DIREKT auf state.misterX.position zu – die tatsächliche,
 * den Detektiven im echten Spiel eigentlich verborgene Position.
 *
 * Zweck: keine faire Spielstrategie, sondern ein Vergleichs-/Testwerkzeug:
 *  - Obergrenze: "Wie schnell könnten die Detektive Mister X fangen, WENN sie
 *    perfekte Information hätten?" – nützlich, um einzuschätzen, wie viel
 *    Vorsprung Mister X allein durch Verstecken (nicht durch Bewegung) gewinnt.
 *  - Stresstest für Mister-X-Strategien: eine Fluchtheuristik, die gegen DIESEN
 *    Gegner besteht, besteht erst recht gegen die fairen Detektiv-Strategien.
 *
 * Bewusst "rein" gehalten (kein Phase-A/B/C-Overhead, keine Einkesselung, keine
 * Ticket-Balance): jeder Detektiv verfolgt unabhängig per Dijkstra den kürzesten
 * Weg zur ECHTEN Mister-X-Position. Kein Rundenplan nötig (anders als bei der
 * Phase-Strategie), da hier ohnehin jede Runde neu und ohne Unsicherheit
 * nachgesteuert werden kann.
 * ============================================================================
 */
@Injectable({ providedIn: 'root' })
export class DetectiveOmniscientDijkstraStrategyService implements DetectiveStrategy {
  readonly id = 'detective-omniscient-dijkstra-v1';
  readonly label = 'Allwissend (reines Dijkstra, kennt Mister X immer)';
  readonly description =
    'CHEAT-MODUS für Tests: ignoriert den Fog-of-War und kennt Mister X\' echte Position ' +
    'jede Runde. Reine Dijkstra-Verfolgung ohne Einkesselung/Ticket-Balance – dient als ' +
    'Obergrenzen-Vergleichswert, keine faire Spielstrategie.';

  constructor(
    private readonly store: GameStateStore,
    private readonly engine: GameEngineService,
    private readonly metrics: GraphMetricsService
  ) {}

  decideMove(detectiveId: string): AiDecision | null {
    const state = this.store.gameState();
    const detective = state.detectives.find(d => d.id === detectiveId);
    if (!detective) return null;

    const validMoves = this.engine.getValidMovesForDetective(detectiveId);
    if (validMoves.length === 0) return null;

    // Der entscheidende Unterschied zu DetectiveAiStrategyService: hier wird
    // die ECHTE Position gelesen, nicht die aus der Fahrtentafel rekonstruierte.
    const target = state.misterX.position;

    if (detective.position === target) {
      // Sollte durch die Fang-Prüfung der Engine ohnehin sofort das Spiel beenden;
      // als Sicherheitsnetz hier trotzdem ein beliebiger gültiger Zug.
      return {
        move: validMoves[0],
        rationale: `[${this.label}] Steht bereits auf Mister X' Position ${target}.`
      };
    }

    let bestMove = validMoves[0];
    let bestDistance = Infinity;

    for (const move of validMoves) {
      const ticketsAfterMove = this.applyHypotheticalUse(detective.tickets, move.transport);
      const distances = this.metrics.dijkstra(move.to, ticketsAfterMove).distances;
      const distanceToTarget = distances.get(target) ?? Infinity;
      if (distanceToTarget < bestDistance) {
        bestDistance = distanceToTarget;
        bestMove = move;
      }
    }

    return {
      move: bestMove,
      rationale:
        `[${this.label}] Verfolgt die ECHTE Position ${target} direkt (kein Fog-of-War). ` +
        `Fährt mit ${bestMove.transport} nach ${bestMove.to} (verbleibende Distanz danach: ${bestDistance}).`
    };
  }

  /** Kein Rundenplan nötig (siehe Klassen-Kommentar) – hier ein No-op für das Interface. */
  invalidatePlan(): void {}

  private applyHypotheticalUse(tickets: TicketInventory, transport: TransportType): TicketInventory {
    const key = transport as TransportType.Taxi | TransportType.Bus | TransportType.UBahn;
    return { ...tickets, [key]: Math.max(tickets[key] - 1, 0) };
  }
}
