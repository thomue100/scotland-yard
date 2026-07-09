import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed } from '@angular/core';
import { BoardComponent } from '../board/board.component';
import { TicketPanelComponent } from '../ticket-panel/ticket-panel.component';
import { MoveLogComponent } from '../move-log/move-log.component';
import { PlayerHudComponent } from '../player-hud/player-hud.component';
import { SetupComponent, NewGameConfig } from '../setup/setup.component';
import { GameEngineService, MoveOption } from '../../core/services/game-engine.service';
import { GameStateStore } from '../../core/services/game-state.store';
import { TransportType } from '../../core/enums/transport-type.enum';
import { TicketInventory } from '../../core/models/ticket.model';
import { DetectiveColor } from '../../core/models/player.model';
import { AiStrategyRegistryService } from '../../ai/strategies/ai-strategy-registry.service';

type UiPhase = 'setup' | 'playing';
type LogTab = 'fahrtentafel' | 'ki';

/** Verzögerung zwischen KI-Zügen, damit man den Ablauf am Bildschirm nachvollziehen kann. */
const AI_MOVE_DELAY_MS = 700;

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BoardComponent,
    TicketPanelComponent,
    MoveLogComponent,
    PlayerHudComponent,
    SetupComponent
  ],
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss'
})
export class GameComponent {
  uiPhase: UiPhase = 'setup';

  /** Overlay-Panel-States für das Notebook-freundliche Layout (siehe Layout-Überarbeitung). */
  controlsOpen = true;
  logsOpen = true;
  activeLogTab: LogTab = 'fahrtentafel';

  /** Vom Spieler gewähltes Verkehrsmittel für den nächsten Zug ("Ansage" wie im Original). */
  selectedTransport: TransportType | null = null;

  /** Doppelzug-Modus: erster Teilzug wird zwischengespeichert, bis der zweite gewählt wurde. */
  doubleMoveArmed = false;
  doubleMoveFirstStep: MoveOption | null = null;

  /** Klartext-Begründungen der KI-Entscheidungen, neueste zuerst (siehe DetectiveAiStrategyService). */
  aiDecisionLog: string[] = [];

  readonly TransportType = TransportType;

  readonly round = computed(() => this.store.round());
  readonly phase = computed(() => this.store.phase());
  readonly currentTurn = computed(() => this.store.currentTurn());
  readonly detectives = computed(() => this.store.detectives());
  readonly misterX = computed(() => this.store.misterX());
  readonly winner = computed(() => this.store.winner());
  readonly variant = computed(() => this.store.gameState().boardVariant);
  readonly maxRounds = computed(() => this.store.gameState().maxRounds);
  readonly revealRounds = computed(() => this.store.gameState().revealRounds);
  readonly humanRole = computed(() => this.store.humanRole());
  readonly devOptions = computed(() => this.store.devOptions());

  constructor(
    private readonly engine: GameEngineService,
    private readonly store: GameStateStore,
    readonly aiStrategies: AiStrategyRegistryService
  ) {}

  // ---------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------

  onStartGame(config: NewGameConfig): void {
    this.engine.startNewGame(
      config.variant,
      config.detectiveSetup,
      config.misterXStart,
      config.humanRole,
      config.alwaysRevealMisterX
    );
    this.uiPhase = 'playing';
    this.aiDecisionLog = [];
    this.aiStrategies.getActiveDetectiveStrategy().invalidatePlan();
    this.resetSelection();
    this.maybeTriggerAiTurn();
  }

  onRestart(): void {
    this.store.reset();
    this.uiPhase = 'setup';
    this.aiDecisionLog = [];
    this.resetSelection();
  }

  onToggleAlwaysReveal(value: boolean): void {
    this.store.setAlwaysRevealMisterX(value);
  }

  // ---------------------------------------------------------------------
  // Anzeige-Hilfen
  // ---------------------------------------------------------------------

  get currentTurnLabel(): string {
    if (this.phase() === 'misterXMove') return 'Mister X';
    const d = this.detectives().find(det => det.id === this.currentTurn());
    return d ? `Detektiv ${d.color}` : '';
  }

  get winnerLabel(): string | null {
    const w = this.winner();
    if (w === 'detectives') return 'Die Detektive haben gewonnen!';
    if (w === 'misterX') return 'Mister X ist entkommen!';
    return null;
  }

  get roleLabel(): string {
    return this.humanRole() === 'misterX'
      ? 'Du spielst Mister X · Detektive = KI'
      : 'Du spielst das Detektiv-Team · Mister X = KI';
  }

  /** Strategie-Dropdown nur für die Seite anzeigen, die gerade von der KI gespielt wird. */
  get showDetectiveStrategySelector(): boolean {
    return this.humanRole() === 'misterX';
  }

  get showMisterXStrategySelector(): boolean {
    return this.humanRole() === 'detectives';
  }

  /**
   * True, wenn gerade die KI-Seite am Zug ist (also NICHT die vom Menschen
   * gewählte Rolle). Steuert, ob das Board klickbar ist bzw. ob im Hintergrund
   * automatisch ein KI-Zug ausgelöst wird.
   */
  get isAiTurn(): boolean {
    if (this.phase() === 'gameOver') return false;
    if (this.phase() === 'misterXMove') return this.humanRole() === 'detectives';
    if (this.phase() === 'detectiveMove') return this.humanRole() === 'misterX';
    return false;
  }

  /** Ticket-Bestand des aktuell aktiven Spielers (für das Ticket-Panel). */
  get activeTickets(): TicketInventory | null {
    if (this.phase() === 'misterXMove') return this.misterX().tickets;
    const d = this.detectives().find(det => det.id === this.currentTurn());
    return d ? d.tickets : null;
  }

  get currentOwnerColor(): DetectiveColor | 'mister-x' | null {
    if (this.phase() === 'misterXMove') return 'mister-x';
    const d = this.detectives().find(det => det.id === this.currentTurn());
    return d ? d.color : null;
  }

  /**
   * Mister X ist normalerweise nur bei Auftauch/Spielende sichtbar. Im
   * Entwicklungsmodus (devOptions.alwaysRevealMisterX) wird die reale
   * Position dagegen IMMER angezeigt, unabhängig von den Standardregeln –
   * praktisch zum Beobachten/Debuggen der KI-Strategien.
   */
  get misterXVisibleAt(): number | null {
    if (this.devOptions().alwaysRevealMisterX) return this.misterX().position;
    if (this.winner() !== null) return this.misterX().position;
    const log = this.misterX().moveLog;
    if (log.length === 0) return null;
    const last = log[log.length - 1];
    return last.revealedStation;
  }

  get originStationForHighlight(): number | null {
    if (this.phase() === 'misterXMove') {
      return this.doubleMoveFirstStep ? this.doubleMoveFirstStep.to : this.misterX().position;
    }
    const d = this.detectives().find(det => det.id === this.currentTurn());
    return d ? d.position : null;
  }

  get highlightedMoves(): MoveOption[] {
    if (this.phase() === 'gameOver') return [];
    if (this.isAiTurn) return []; // KI führt ihren Zug selbst aus, keine Klick-Marker nötig

    if (this.phase() === 'misterXMove') {
      if (!this.selectedTransport) return [];
      if (this.doubleMoveArmed && this.doubleMoveFirstStep) {
        const ticketsAfterFirst = this.ticketsAfterHypotheticalHop(
          this.misterX().tickets,
          this.doubleMoveFirstStep.transport
        );
        return this.engine.getValidSecondHopOptions(
          this.doubleMoveFirstStep.to,
          this.selectedTransport,
          ticketsAfterFirst
        );
      }
      return this.engine.getValidMovesForMisterX(this.selectedTransport);
    }

    const detectiveId = this.currentTurn();
    const all = this.engine.getValidMovesForDetective(detectiveId);
    return this.selectedTransport ? all.filter(m => m.transport === this.selectedTransport) : all;
  }

  get canUseBlack(): boolean {
    return this.phase() === 'misterXMove' && !this.isAiTurn && this.misterX().tickets.black > 0;
  }

  get canUseDoubleMove(): boolean {
    return (
      this.phase() === 'misterXMove' &&
      !this.isAiTurn &&
      this.misterX().tickets.doubleMoves > 0 &&
      !this.doubleMoveArmed
    );
  }

  get currentDetectiveCanMove(): boolean {
    if (this.phase() !== 'detectiveMove') return true;
    const d = this.detectives().find(det => det.id === this.currentTurn());
    return d ? d.canMove : true;
  }

  // ---------------------------------------------------------------------
  // Interaktion (Mensch)
  // ---------------------------------------------------------------------

  selectTransport(t: TransportType): void {
    this.selectedTransport = this.selectedTransport === t ? null : t;
  }

  armDoubleMove(): void {
    this.doubleMoveArmed = true;
    this.doubleMoveFirstStep = null;
    this.selectedTransport = null;
  }

  cancelDoubleMove(): void {
    this.doubleMoveArmed = false;
    this.doubleMoveFirstStep = null;
    this.selectedTransport = null;
  }

  onStationClicked(move: MoveOption): void {
    if (this.isAiTurn) return; // Sicherheitsnetz: während KI am Zug ist, keine menschlichen Klicks verarbeiten

    try {
      if (this.phase() === 'detectiveMove') {
        this.engine.executeDetectiveMove(this.currentTurn(), move.to, move.transport);
        this.resetSelection();
        this.maybeTriggerAiTurn();
        return;
      }

      if (this.phase() === 'misterXMove') {
        if (this.doubleMoveArmed) {
          if (!this.doubleMoveFirstStep) {
            this.doubleMoveFirstStep = move;
            this.selectedTransport = null;
          } else {
            this.engine.executeMisterXDoubleMove(this.doubleMoveFirstStep, move);
            this.cancelDoubleMove();
            this.maybeTriggerAiTurn();
          }
          return;
        }
        this.engine.executeMisterXMove(move.to, move.transport);
        this.resetSelection();
        this.maybeTriggerAiTurn();
      }
    } catch (error) {
      // Sollte im Normalfall nie auftreten (highlightedMoves und die Validierung in
      // GameEngineService nutzen dieselbe Logik) – falls doch, hier sichtbar loggen
      // statt eine leise Exception zu verschlucken, die den Klick wirkungslos macht.
      console.error('[GameComponent] Zug wurde abgelehnt:', error, 'Angeklickter Zug:', move);
    }
  }

  skipDetective(): void {
    this.engine.skipDetectiveTurn(this.currentTurn());
    this.resetSelection();
    this.maybeTriggerAiTurn();
  }

  // ---------------------------------------------------------------------
  // KI-Steuerung
  // ---------------------------------------------------------------------

  /**
   * Prüft, ob gerade die KI-Seite am Zug ist, und löst nach kurzer Verzögerung
   * (AI_MOVE_DELAY_MS) automatisch den nächsten KI-Zug aus. Ruft sich danach
   * selbst erneut auf – so werden z. B. alle Detektive einer Runde nacheinander
   * automatisch abgehandelt, bis wieder der Mensch am Zug ist oder das Spiel endet.
   */
  private maybeTriggerAiTurn(): void {
    if (this.store.gameState().phase === 'gameOver') return;
    if (!this.isAiTurn) return;

    setTimeout(() => this.runOneAiTurn(), AI_MOVE_DELAY_MS);
  }

  private runOneAiTurn(): void {
    const state = this.store.gameState();
    if (state.phase === 'gameOver') return;

    if (state.phase === 'detectiveMove') {
      const detectiveId = state.currentTurn;
      const decision = this.aiStrategies.getActiveDetectiveStrategy().decideMove(detectiveId);
      if (decision) {
        this.engine.executeDetectiveMove(detectiveId, decision.move.to, decision.move.transport);
        this.logAiDecision(decision.rationale);
      } else {
        // Kein gültiger Zug für diesen Detektiv -> aussetzen (siehe Anleitung, "stehenbleiben").
        this.engine.skipDetectiveTurn(detectiveId);
        const d = state.detectives.find(det => det.id === detectiveId);
        this.logAiDecision(`Detektiv ${d?.color ?? detectiveId} hat keinen gültigen Zug und setzt aus.`);
      }
    } else if (state.phase === 'misterXMove') {
      const decision = this.aiStrategies.getActiveMisterXStrategy().decideMove();
      if (decision) {
        if (decision.secondMove) {
          this.engine.executeMisterXDoubleMove(decision.move, decision.secondMove);
        } else {
          this.engine.executeMisterXMove(decision.move.to, decision.move.transport);
        }
        this.logAiDecision(decision.rationale);
      }
    }

    this.maybeTriggerAiTurn();
  }

  private logAiDecision(text: string): void {
    this.aiDecisionLog = [text, ...this.aiDecisionLog].slice(0, 30);
  }

  // ---------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------

  private resetSelection(): void {
    this.selectedTransport = null;
    this.doubleMoveArmed = false;
    this.doubleMoveFirstStep = null;
  }

  private ticketsAfterHypotheticalHop(tickets: TicketInventory, transport: TransportType): TicketInventory {
    if (transport === TransportType.Black) {
      return { ...tickets, black: tickets.black - 1 };
    }
    return { ...tickets, [transport]: (tickets as any)[transport] - 1 };
  }
}
