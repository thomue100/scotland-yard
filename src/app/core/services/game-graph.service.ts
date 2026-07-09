import { Injectable } from '@angular/core';
import { verbindungen } from '../data/connections.raw';
import { CONNECTION_CORRECTIONS } from '../data/connections-corrections';
import { stations, offset_x, offset_y } from '../data/stations-classic.raw';
import { stations_modern, offset_modern_x, offset_modern_y } from '../data/stations-modern.raw';
import { TransportType } from '../enums/transport-type.enum';
import { AdjacencyEntry, AdjacencyMap, Connection, RawConnection } from '../models/connection.model';
import { BoardVariant, PawnOffset, Station } from '../models/station.model';
import { BOAT_CONNECTIONS } from '../models/game-state.model';

/**
 * Mapping der deutschen Strings aus den Rohdaten auf das TransportType-Enum.
 * Wird bewusst explizit gehalten (kein direktes Casting), damit ein Tippfehler
 * in den Rohdaten (z. B. "U-bahn" statt "U-Bahn") beim Bootstrap auffällt
 * statt zu einer stillen "undefined"-Kante zu führen.
 */
const TRANSPORT_LOOKUP: Record<string, TransportType> = {
  Taxi: TransportType.Taxi,
  Bus: TransportType.Bus,
  'U-Bahn': TransportType.UBahn
};

@Injectable({ providedIn: 'root' })
export class GameGraphService {
  private readonly connections: Connection[];
  private readonly adjacency: AdjacencyMap;
  private readonly stationsByVariant: Record<BoardVariant, Map<number, Station>>;
  private readonly pawnOffsetByVariant: Record<BoardVariant, PawnOffset>;

  /** Kanten aus den Rohdaten, die keine Rückrichtung besitzen – zur manuellen Prüfung gegen den Spielplan. */
  readonly asymmetricConnections: Connection[];

  constructor() {
    this.connections = this.buildConnections();
    this.adjacency = this.buildAdjacency(this.connections);
    this.stationsByVariant = {
      klassisch: this.buildStationMap(stations),
      modern: this.buildStationMap(stations_modern)
    };
    this.pawnOffsetByVariant = {
      klassisch: { x: offset_x, y: offset_y },
      modern: { x: offset_modern_x, y: offset_modern_y }
    };
    this.asymmetricConnections = this.findAsymmetricConnections(this.connections);
    if (this.asymmetricConnections.length > 0) {
      console.warn(
        `[GameGraphService] ${this.asymmetricConnections.length} asymmetrische Verbindung(en) ` +
        `gefunden, die nicht in connections-corrections.ts abgedeckt sind:`,
        this.asymmetricConnections
      );
    }
  }

  // ---------------------------------------------------------------------
  // Aufbau
  // ---------------------------------------------------------------------

  private buildConnections(): Connection[] {
    const result: Connection[] = [];
    const rawAll: RawConnection[] = [...verbindungen, ...CONNECTION_CORRECTIONS];

    for (const raw of rawAll) {
      const transport = TRANSPORT_LOOKUP[raw.verkehrsmittel];
      if (!transport) {
        throw new Error(
          `Unbekanntes Verkehrsmittel "${raw.verkehrsmittel}" in Verbindung ${raw.start} -> ${raw.ziel}. ` +
          `Rohdaten prüfen (connections.raw.ts / connections-corrections.ts).`
        );
      }
      result.push({ from: raw.start, to: raw.ziel, transport });
    }

    // Boot-Verbindungen sind in verbindungen.ts NICHT enthalten (siehe Anleitung S.6) –
    // sie werden hier bidirektional als eigene TransportType.Boot-Kanten ergänzt.
    for (const [a, b] of BOAT_CONNECTIONS) {
      result.push({ from: a, to: b, transport: TransportType.Boot });
      result.push({ from: b, to: a, transport: TransportType.Boot });
    }

    return result;
  }

  private buildAdjacency(connections: Connection[]): AdjacencyMap {
    const map: AdjacencyMap = new Map();
    for (const c of connections) {
      const entry: AdjacencyEntry = { to: c.to, transport: c.transport };
      if (!map.has(c.from)) {
        map.set(c.from, []);
      }
      map.get(c.from)!.push(entry);
    }
    return map;
  }

  private buildStationMap(
    raw: { stationsnummer: number; x: number; y: number; stationswert: number }[]
  ): Map<number, Station> {
    const map = new Map<number, Station>();
    for (const s of raw) {
      if (s.stationsnummer === 0) continue; // Dummy-Station überspringen
      map.set(s.stationsnummer, {
        id: s.stationsnummer,
        x: s.x,
        y: s.y,
        value: s.stationswert
      });
    }
    return map;
  }

  private findAsymmetricConnections(connections: Connection[]): Connection[] {
    const key = (from: number, to: number, t: TransportType) => `${from}-${to}-${t}`;
    const set = new Set(connections.map(c => key(c.from, c.to, c.transport)));
    return connections.filter(c => !set.has(key(c.to, c.from, c.transport)));
  }

  // ---------------------------------------------------------------------
  // Öffentliche API
  // ---------------------------------------------------------------------

  /** Alle von einer Station aus direkt erreichbaren Ziele (inkl. benötigtem Verkehrsmittel). */
  getNeighbors(stationId: number): AdjacencyEntry[] {
    return this.adjacency.get(stationId) ?? [];
  }

  /**
   * Prüft, ob eine direkte Kante mit dem angegebenen Verkehrsmittel existiert.
   * Ein Black Ticket ersetzt jedes normale Verkehrsmittel (Taxi/Bus/U-Bahn) UND das Boot –
   * daher wird bei transport === Black geprüft, ob IRGENDEINE Kante (gleich welchen Typs) existiert.
   */
  hasDirectConnection(from: number, to: number, transport: TransportType): boolean {
    const neighbors = this.getNeighbors(from);
    if (transport === TransportType.Black) {
      return neighbors.some(n => n.to === to);
    }
    return neighbors.some(n => n.to === to && n.transport === transport);
  }

  /** Liefert alle Verkehrsmittel, mit denen man von "from" nach "to" gelangen kann. */
  getPossibleTransports(from: number, to: number): TransportType[] {
    return this.getNeighbors(from)
      .filter(n => n.to === to)
      .map(n => n.transport);
  }

  getStation(variant: BoardVariant, id: number): Station | undefined {
    return this.stationsByVariant[variant].get(id);
  }

  /** Offset für die Platzierung der Spielfigur-Grafik (Pin-Spitze auf Stationspunkt), siehe PawnOffset. */
  getPawnOffset(variant: BoardVariant): PawnOffset {
    return this.pawnOffsetByVariant[variant];
  }

  getAllStations(variant: BoardVariant): Station[] {
    return Array.from(this.stationsByVariant[variant].values());
  }

  /** Für Debug/Tests: rohe Kantenliste. */
  getAllConnections(): Connection[] {
    return this.connections;
  }
}
