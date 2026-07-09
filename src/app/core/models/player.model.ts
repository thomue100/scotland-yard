import { TransportType } from '../enums/transport-type.enum';
import { TicketInventory } from './ticket.model';

export type DetectiveColor = 'blau' | 'gelb' | 'gruen' | 'rot' | 'schwarz';

export interface Detective {
  id: string;
  color: DetectiveColor;
  position: number;          // aktuelle Station, immer bekannt
  tickets: TicketInventory;
  /** true, solange der Detektiv noch ziehen kann (mind. ein gültiger Zug verfügbar). */
  canMove: boolean;
}

/** Ein Eintrag der "Fahrtentafel" – das, was die Detektive von Mister X' letztem Zug sehen. */
export interface MisterXLogEntry {
  round: number;
  transportUsed: TransportType;      // immer sichtbar (außer bei Black Ticket -> "unbekannt")
  transportRevealed: boolean;        // false bei Black Ticket
  revealedStation: number | null;    // nur in Auftauch-Runden gesetzt
  isDoubleMoveEntry: boolean;        // Teil eines Doppelzugs (2 Log-Einträge pro Doppelzug)
}

export interface MisterX {
  position: number;                  // reale Position, den Detektiven unbekannt
  tickets: TicketInventory;
  moveLog: MisterXLogEntry[];
}
