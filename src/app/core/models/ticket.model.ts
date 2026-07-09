import { TransportType } from '../enums/transport-type.enum';

/**
 * Ticket-Bestand eines Spielers.
 * Bei Detektiven sind black/doubleMoves immer 0/undefined (sie besitzen diese Tickets nie).
 * Bei Mister X werden black/doubleMoves gemäß Regelwerk befüllt.
 */
export interface TicketInventory {
  [TransportType.Taxi]: number;
  [TransportType.Bus]: number;
  [TransportType.UBahn]: number;
  black: number;         // nur Mister X (Anzahl = Anzahl teilnehmender Detektive)
  doubleMoves: number;   // nur Mister X (Standard: 2)
}

export function createDetectiveTickets(taxi = 10, bus = 8, uBahn = 4): TicketInventory {
  return {
    [TransportType.Taxi]: taxi,
    [TransportType.Bus]: bus,
    [TransportType.UBahn]: uBahn,
    black: 0,
    doubleMoves: 0
  };
}

export function createMisterXTickets(detectiveCount: number): TicketInventory {
  return {
    [TransportType.Taxi]: 4,
    [TransportType.Bus]: 3,
    [TransportType.UBahn]: 3,
    black: detectiveCount,
    doubleMoves: 2
  };
}
