/**
 * Verkehrsmittel im Spiel.
 * Die String-Werte entsprechen 1:1 den Werten aus verbindungen.ts ("verkehrsmittel"-Feld),
 * damit die Rohdaten ohne Transformation gemappt werden können.
 */
export enum TransportType {
  Taxi = 'Taxi',
  Bus = 'Bus',
  UBahn = 'U-Bahn',
  Boot = 'Boot',   // Sonderverbindung, nur Mister X, nur mit Black Ticket (nicht in verbindungen.ts enthalten)
  Black = 'Black'  // Mister X Universal-Ticket (ersetzt jedes normale Ticket)
}

/** Tickets, die im normalen Ticket-Vorrat der Detektive vorkommen (kein Black Ticket). */
export type RegularTransport = TransportType.Taxi | TransportType.Bus | TransportType.UBahn;

export const REGULAR_TRANSPORTS: RegularTransport[] = [
  TransportType.Taxi,
  TransportType.Bus,
  TransportType.UBahn
];
