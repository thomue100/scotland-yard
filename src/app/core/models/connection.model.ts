import { TransportType } from '../enums/transport-type.enum';

/** Eine gerichtete Kante im Rohformat (wie in verbindungen.ts). */
export interface RawConnection {
  start: number;
  ziel: number;
  verkehrsmittel: string;
}

/** Bereinigte, typisierte Kante für die Spiellogik. */
export interface Connection {
  from: number;
  to: number;
  transport: TransportType;
}

/** Eintrag in der Adjazenzliste: von "from" aus erreichbare Ziele + benötigtes Verkehrsmittel. */
export interface AdjacencyEntry {
  to: number;
  transport: TransportType;
}

export type AdjacencyMap = Map<number, AdjacencyEntry[]>;
