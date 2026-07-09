import { Detective, MisterX } from './player.model';
import { BoardVariant } from './station.model';

export type GamePhase =
  | 'setup'
  | 'misterXMove'
  | 'detectiveMove'
  | 'gameOver';

export type Winner = 'detectives' | 'misterX' | null;

/** Welche Seite der Mensch am Bildschirm steuert. Die jeweils andere Seite läuft über KI. */
export type HumanRole = 'misterX' | 'detectives';

/**
 * Entwicklungs-/Debug-Optionen, die die Standardregeln bewusst aufweichen,
 * um die KI-Strategien beobachten und testen zu können. Für den "echten"
 * Spielbetrieb später einfach alwaysRevealMisterX=false setzen bzw. die
 * entsprechende Checkbox im Setup entfernen.
 */
export interface DevOptions {
  /** true = Mister X ist ständig auf dem Board sichtbar (nur zu Kontrollzwecken beim Entwickeln). */
  alwaysRevealMisterX: boolean;
}

export interface GameState {
  boardVariant: BoardVariant;
  round: number;               // aktuelle Zugnummer von Mister X (1-indiziert)
  maxRounds: number;           // klassisch: 22 (siehe Anleitung, "spätestens mit dem 22. Zug")
  revealRounds: number[];      // [3, 8, 13, 18] + finale Runde (maxRounds) gilt implizit als Reveal
  phase: GamePhase;
  currentTurn: 'misterX' | string; // 'misterX' oder Detective.id
  /** Reihenfolge der Detektive für den Uhrzeigersinn-Zugzwang (siehe Anleitung). */
  detectiveOrder: string[];
  detectives: Detective[];
  misterX: MisterX;
  winner: Winner;
  humanRole: HumanRole;
  devOptions: DevOptions;
}

/** Sonderverbindungen der Themse (nur mit Black Ticket, nur Mister X, siehe Anleitung S.6). */
export const BOAT_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [194, 157],
  [157, 115],
  [115, 118]
];
