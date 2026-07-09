import { Injectable } from '@angular/core';
import { GameStateStore } from '../../core/services/game-state.store';
import { GameEngineService, MoveOption } from '../../core/services/game-engine.service';
import { GraphMetricsService } from '../../core/services/graph-metrics.service';
import { TransportType } from '../../core/enums/transport-type.enum';
import { AiDecision, MisterXStrategy } from './strategy.types';

/**
 * Einfache Strategie für Mister X: unter allen aktuell gültigen Zügen (nur
 * reguläre Tickets, kein Black/Doppelzug) wird derjenige gewählt, der die
 * SUMME der Distanzen zu allen Detektiven maximiert – Mister X "flieht"
 * also vom Schwerpunkt der Verfolger weg. Bewusst schwach gehalten als
 * Baseline zum Vergleich mit der ernsthafteren HeuristicStrategy.
 */
@Injectable({ providedIn: 'root' })
export class MisterXNaiveStrategyService implements MisterXStrategy {
  readonly id = 'misterx-naive-v1';
  readonly label = 'Naiv (Distanz-Summe maximieren)';
  readonly description =
    'Maximiert die Summe der Distanzen zu allen Detektiven. Kein Sackgassen-Bewusstsein, ' +
    'kein gezielter Einsatz von Black Tickets/Doppelzügen. Dient als schwache Baseline.';

  constructor(
    private readonly store: GameStateStore,
    private readonly engine: GameEngineService,
    private readonly metrics: GraphMetricsService
  ) {}

  decideMove(): AiDecision | null {
    const state = this.store.gameState();
    const regularTransports = [TransportType.Taxi, TransportType.Bus, TransportType.UBahn];

    const candidateMoves: MoveOption[] = regularTransports.flatMap(t =>
      this.engine.getValidMovesForMisterX(t)
    );
    if (candidateMoves.length === 0) return null;

    let bestMove = candidateMoves[0];
    let bestScore = -Infinity;

    for (const move of candidateMoves) {
      let totalDetectiveDistance = 0;
      for (const detective of state.detectives) {
        const distances = this.metrics.dijkstra(detective.position, detective.tickets).distances;
        totalDetectiveDistance += distances.get(move.to) ?? 0;
      }
      if (totalDetectiveDistance > bestScore) {
        bestScore = totalDetectiveDistance;
        bestMove = move;
      }
    }

    return {
      move: bestMove,
      rationale:
        `[${this.label}] Fährt mit ${bestMove.transport} nach ${bestMove.to} ` +
        `(maximiert die Summe der Detektiv-Distanzen: ${bestScore}). ` +
        `Nutzt bewusst noch keine Black Tickets/Doppelzüge.`
    };
  }
}
