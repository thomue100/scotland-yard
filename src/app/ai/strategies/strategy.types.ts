import { MoveOption } from '../../core/services/game-engine.service';

export interface AiDecision {
  move: MoveOption;
  /** Zweiter Teilzug, falls die Strategie einen Doppelzug ausführen möchte (nur Mister X). */
  secondMove?: MoveOption;
  /** Klartext-Begründung für UI/Logs – WARUM wurde genau dieser Zug gewählt? */
  rationale: string;
}

/**
 * Gemeinsame Basis für alle austauschbaren KI-Strategien (Detektive UND Mister X).
 * id = stabiler Schlüssel (z. B. für Persistenz/Auswahl-Dropdown),
 * label = Anzeigename in der UI.
 */
export interface AiStrategy {
  readonly id: string;
  readonly label: string;
  /** Kurze Beschreibung für die UI (Tooltip/Untertitel im Strategie-Dropdown). */
  readonly description: string;
}

export interface DetectiveStrategy extends AiStrategy {
  decideMove(detectiveId: string): AiDecision | null;
  /** Erzwingt Neuplanung, z. B. nach Spielstart/Reset oder Strategie-Wechsel mitten im Spiel. */
  invalidatePlan(): void;
}

export interface MisterXStrategy extends AiStrategy {
  decideMove(): AiDecision | null;
}
