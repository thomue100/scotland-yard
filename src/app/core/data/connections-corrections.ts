import { RawConnection } from '../models/connection.model';

/**
 * Korrektur fehlender Rückverbindungen aus connections.raw.ts.
 *
 * Beim Aufbau des Graphen wurden 9 Kanten gefunden, die keine Rückrichtung besitzen
 * (z. B. 116 -> 118 Bus, aber kein 118 -> 116 Bus). Das reale Scotland-Yard-Brett kennt
 * keine Einbahnstraßen – jede Verkehrsverbindung ist immer in beide Richtungen befahrbar
 * (die Anleitung warnt nur davor, dass man optisch Verbindungen VERMUTET, die es gar
 * nicht gibt – nicht davor, dass Verbindungen nur in eine Richtung gelten).
 *
 * Diese Datei ergänzt daher gezielt die 9 fehlenden Rückkanten, OHNE die Original-
 * Rohdaten in connections.raw.ts zu verändern (Nachvollziehbarkeit / Diff-Fähigkeit
 * gegenüber der Quelle bleibt erhalten). GameGraphService merged diese Liste beim
 * Bootstrap dazu.
 *
 * Alle 9 Stellen liegen im Themse-Bereich (Waterloo/Southwark, Stationen 108-199) –
 * ein Bereich mit dicht liegenden Punkten, in dem eine übersehene Zeile beim manuellen
 * Digitalisieren plausibel ist.
 *
 * WICHTIG: Diese Annahme sollte einmalig gegen den Original-Spielplan verifiziert werden.
 * Falls sich herausstellt, dass eine dieser Verbindungen tatsächlich als Einbahnstraße
 * gedacht war, hier einfach die entsprechende Zeile entfernen.
 */
export const CONNECTION_CORRECTIONS: RawConnection[] = [
  { start: 118, ziel: 116, verkehrsmittel: 'Bus' },   // Gegenrichtung zu 116 -> 118 Bus
  { start: 118, ziel: 117, verkehrsmittel: 'Taxi' },  // Gegenrichtung zu 117 -> 118 Taxi
  { start: 116, ziel: 118, verkehrsmittel: 'Taxi' },  // Gegenrichtung zu 118 -> 116 Taxi
  { start: 185, ziel: 157, verkehrsmittel: 'Taxi' },  // Gegenrichtung zu 157 -> 185 Taxi
  { start: 171, ziel: 158, verkehrsmittel: 'Taxi' },  // Gegenrichtung zu 158 -> 171 Taxi
  { start: 158, ziel: 159, verkehrsmittel: 'Taxi' },  // Gegenrichtung zu 159 -> 158 Taxi
  { start: 198, ziel: 185, verkehrsmittel: 'Bus' },   // Gegenrichtung zu 185 -> 198 Bus
  { start: 157, ziel: 185, verkehrsmittel: 'Bus' },   // Gegenrichtung zu 185 -> 157 Bus
  { start: 185, ziel: 187, verkehrsmittel: 'Bus' }    // Gegenrichtung zu 187 -> 185 Bus
];
