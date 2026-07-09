import { Injectable } from '@angular/core';
import { GameGraphService } from './game-graph.service';
import { TransportType } from '../enums/transport-type.enum';
import { TicketInventory } from '../models/ticket.model';

export interface DijkstraResult {
  /** Kürzeste Distanz (Anzahl Fahrten) von der Startstation zu jeder erreichbaren Station. */
  distances: Map<number, number>;
  /** Vorgänger-Station auf dem kürzesten Pfad (für Pfad-Rekonstruktion). */
  previous: Map<number, number>;
  /** Verkehrsmittel, mit dem der jeweilige Vorgänger-Schritt gefahren wurde. */
  previousTransport: Map<number, TransportType>;
}

/**
 * Graph-Analysefunktionen für die KI-Strategien.
 *
 * Bewusst getrennt vom GameGraphService: Der GameGraphService bildet nur die
 * reinen Spielregeln ab (welche Kante existiert, welches Ticket braucht sie).
 * Dieser Service baut DARAUF AUF und beantwortet taktische Fragen
 * ("welche Station ist gut positioniert?", "wie komme ich am schnellsten von A nach B,
 * wenn ich nur noch bestimmte Tickets habe?").
 */
@Injectable({ providedIn: 'root' })
export class GraphMetricsService {
  private degreeCentralityCache: Map<number, number> | null = null;

  constructor(private readonly graph: GameGraphService) {}

  /**
   * Degree-Centrality je Station = Anzahl ausgehender Kanten (über alle
   * Verkehrsmittel gezählt, NICHT dedupliziert nach Zielstation).
   *
   * Warum nicht dedupliziert? Eine Station, die z. B. 3 Nachbarn per Taxi UND
   * zusätzlich 2 davon auch per Bus erreicht, bietet mehr taktische Flexibilität
   * (Ticket-Ausweichmöglichkeiten) als eine Station mit nur 3 Taxi-Kanten und
   * sonst nichts – auch wenn beide "3 Nachbarn" hätten. Für die Positionierung
   * der Detektive (Phase A) ist genau diese Flexibilität relevant, nicht nur
   * die reine Nachbarnzahl.
   *
   * Ergebnis wird gecacht, da sich die Graphstruktur zur Laufzeit nie ändert.
   */
  getDegreeCentrality(): Map<number, number> {
    if (this.degreeCentralityCache) return this.degreeCentralityCache;

    const centrality = new Map<number, number>();
    for (const conn of this.graph.getAllConnections()) {
      if (conn.transport === TransportType.Boot) continue; // Boot ist Sonderfall, verzerrt sonst die Wertung
      centrality.set(conn.from, (centrality.get(conn.from) ?? 0) + 1);
    }
    this.degreeCentralityCache = centrality;
    return centrality;
  }

  /** Liefert die N Stationen mit der höchsten Degree-Centrality (für Phase A). */
  getTopCentralStations(n: number): number[] {
    return Array.from(this.getDegreeCentrality().entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([stationId]) => stationId);
  }

  /**
   * Alle Stationen, die von "from" aus in HÖCHSTENS maxHops Fahrten erreichbar sind,
   * wobei nur Kanten mit einem der erlaubten Verkehrsmittel gezählt werden.
   * Wird für die "wo könnte Mister X jetzt sein?"-Wolke in Phase B genutzt – dort
   * kennen wir keine konkreten Tickets eines einzelnen Spielers, sondern nur, welche
   * Verkehrsmitteltypen laut Fahrtentafel überhaupt noch plausibel sind.
   */
  bfsReachableWithinHops(from: number, maxHops: number, allowedTransports: Set<TransportType>): Set<number> {
    const reachable = new Set<number>([from]);
    let frontier = [from];
    for (let hop = 0; hop < maxHops; hop++) {
      const nextFrontier: number[] = [];
      for (const station of frontier) {
        for (const edge of this.graph.getNeighbors(station)) {
          if (!allowedTransports.has(edge.transport)) continue;
          if (reachable.has(edge.to)) continue;
          reachable.add(edge.to);
          nextFrontier.push(edge.to);
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
    return reachable;
  }

  /**
   * Dijkstra ausgehend von "from", eingeschränkt auf Kanten, deren Verkehrsmittel
   * gerade verfügbar ist (tickets[transport] > 0). Da jede Kante "Kosten" 1 hat
   * (eine Fahrt = eine Fahrt, unabhängig vom Verkehrsmittel), ist das Ergebnis
   * identisch zu einer reinen Breitensuche (BFS) – wir behalten trotzdem die
   * Dijkstra-Struktur (Prioritäts-Auswahl über die Distanz-Map) bei, weil sie
   * sich sehr leicht auf echte Gewichte erweitern lässt (z. B. später: U-Bahn
   * "billiger" werten, um sie zu bevorzugen, sobald Ticketknappheit droht).
   *
   * Black Tickets werden hier NICHT berücksichtigt (die haben nur Mister X),
   * Boot ebenfalls nicht (Detektive dürfen es nicht nutzen).
   */
  dijkstra(
    from: number,
    tickets: TicketInventory,
    costFn: (transport: TransportType, tickets: TicketInventory) => number = () => 1
  ): DijkstraResult {
    const distances = new Map<number, number>([[from, 0]]);
    const previous = new Map<number, number>();
    const previousTransport = new Map<number, TransportType>();
    const visited = new Set<number>();

    // Einfache Priority-Queue-Simulation: bei <=199 Knoten reicht lineares
    // Durchsuchen der offenen Menge, ein Heap wäre hier überdimensioniert.
    const unvisitedWithDistance = (): number | null => {
      let best: number | null = null;
      let bestDist = Infinity;
      for (const [station, dist] of distances) {
        if (!visited.has(station) && dist < bestDist) {
          best = station;
          bestDist = dist;
        }
      }
      return best;
    };

    let current: number | null = from;
    while (current !== null) {
      visited.add(current);
      const currentDist = distances.get(current)!;

      for (const edge of this.graph.getNeighbors(current)) {
        if (edge.transport === TransportType.Boot) continue;
        if (tickets[edge.transport as TransportType.Taxi | TransportType.Bus | TransportType.UBahn] <= 0) continue;
        if (visited.has(edge.to)) continue;

        const candidateDist = currentDist + costFn(edge.transport, tickets);
        if (candidateDist < (distances.get(edge.to) ?? Infinity)) {
          distances.set(edge.to, candidateDist);
          previous.set(edge.to, current);
          previousTransport.set(edge.to, edge.transport);
        }
      }

      current = unvisitedWithDistance();
    }

    return { distances, previous, previousTransport };
  }

  /**
   * Rekonstruiert aus einem Dijkstra-Ergebnis den ERSTEN Schritt (nächste Station +
   * Verkehrsmittel) auf dem kürzesten Pfad zu "target". Das ist die einzige
   * Information, die ein Detektiv für seinen NÄCHSTEN Zug tatsächlich braucht –
   * der Rest des Pfades wird ohnehin jede Runde neu berechnet, sobald sich
   * Mister X' vermutete Position ändert.
   */
  getFirstStepTowards(result: DijkstraResult, from: number, target: number): { to: number; transport: TransportType } | null {
    if (!result.distances.has(target) || target === from) return null;

    // Pfad von "target" rückwärts bis zu "from" verfolgen, um den ersten Schritt zu finden.
    let station = target;
    let step: { to: number; transport: TransportType } | null = null;
    while (result.previous.has(station)) {
      const prev = result.previous.get(station)!;
      const transport = result.previousTransport.get(station)!;
      step = { to: station, transport };
      if (prev === from) return step;
      station = prev;
    }
    return null;
  }
}
