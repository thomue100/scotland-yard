import { Injectable, computed, signal } from '@angular/core';
import { GameState } from '../models/game-state.model';
import { Detective } from '../models/player.model';
import { createMisterXTickets } from '../models/ticket.model';

const INITIAL_STATE: GameState = {
  boardVariant: 'klassisch',
  round: 0,
  maxRounds: 22,
  revealRounds: [3, 8, 13, 18],
  phase: 'setup',
  currentTurn: 'misterX',
  detectiveOrder: [],
  detectives: [],
  misterX: {
    position: 0,
    tickets: createMisterXTickets(0), // wird bei Setup mit echter Detektivzahl neu erzeugt
    moveLog: []
  },
  winner: null,
  humanRole: 'misterX',
  devOptions: {
    alwaysRevealMisterX: true // Entwicklungsmodus: siehe SetupComponent-Checkbox
  }
};

/**
 * Zentraler, reaktiver Spielzustand. Bewusst als einfacher Signal-Store gehalten
 * (kein NgRx) – der Zustand ist ein einzelner zusammenhängender Baum, den alle
 * Feature-Komponenten lesend über computed()-Signale konsumieren.
 * Schreibender Zugriff erfolgt ausschließlich über GameEngineService, nie direkt
 * aus UI-Komponenten, damit Invarianten (z. B. Rundenlogik) an einer Stelle bleiben.
 */
@Injectable({ providedIn: 'root' })
export class GameStateStore {
  private readonly state = signal<GameState>(structuredClone(INITIAL_STATE));

  readonly gameState = this.state.asReadonly();

  readonly round = computed(() => this.state().round);
  readonly phase = computed(() => this.state().phase);
  readonly currentTurn = computed(() => this.state().currentTurn);
  readonly winner = computed(() => this.state().winner);
  readonly detectives = computed(() => this.state().detectives);
  readonly misterX = computed(() => this.state().misterX);

  readonly isGameOver = computed(() => this.state().phase === 'gameOver');
  readonly humanRole = computed(() => this.state().humanRole);
  readonly devOptions = computed(() => this.state().devOptions);

  /** Live umschaltbar auch während einer laufenden Partie (Kontroll-Checkbox). */
  setAlwaysRevealMisterX(value: boolean): void {
    this.patch(s => ({ ...s, devOptions: { ...s.devOptions, alwaysRevealMisterX: value } }));
  }

  getDetective(id: string): Detective | undefined {
    return this.state().detectives.find(d => d.id === id);
  }

  /** Interner Setter – nur für GameEngineService gedacht. */
  patch(updater: (current: GameState) => GameState): void {
    this.state.update(updater);
  }

  reset(): void {
    this.state.set(structuredClone(INITIAL_STATE));
  }
}
