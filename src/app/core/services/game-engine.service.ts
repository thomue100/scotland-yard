import { Injectable } from '@angular/core';
import { TransportType } from '../enums/transport-type.enum';
import { Detective, DetectiveColor, MisterXLogEntry } from '../models/player.model';
import { createDetectiveTickets, createMisterXTickets, TicketInventory } from '../models/ticket.model';
import { BoardVariant } from '../models/station.model';
import { GameGraphService } from './game-graph.service';
import { GameStateStore } from './game-state.store';

export interface MoveValidationResult {
  valid: boolean;
  reason?: string;
}

export interface MoveOption {
  to: number;
  transport: TransportType;
}

@Injectable({ providedIn: 'root' })
export class GameEngineService {
  constructor(
    private readonly graph: GameGraphService,
    private readonly store: GameStateStore
  ) {}

  // ---------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------

  /**
   * Initialisiert eine neue Partie.
   * @param detectiveSetup Farbe + Startposition je Detektiv (Startposition kommt aus den
   *        verdeckt gezogenen Startkarten – das Ziehen selbst ist Teil der Setup-UI, nicht der Engine).
   * @param misterXStart Startposition von Mister X (bleibt den Detektiven verborgen).
   */
  startNewGame(
    boardVariant: BoardVariant,
    detectiveSetup: { color: DetectiveColor; startStation: number }[],
    misterXStart: number,
    humanRole: 'misterX' | 'detectives' = 'misterX',
    alwaysRevealMisterX = true
  ): void {
    const detectives: Detective[] = detectiveSetup.map((d, index) => ({
      id: `detective-${index}`,
      color: d.color,
      position: d.startStation,
      tickets: createDetectiveTickets(),
      canMove: true
    }));

    this.store.patch(current => ({
      ...current,
      boardVariant,
      round: 0,
      phase: 'misterXMove',
      currentTurn: 'misterX',
      detectiveOrder: detectives.map(d => d.id),
      detectives,
      misterX: {
        position: misterXStart,
        tickets: createMisterXTickets(detectives.length),
        moveLog: []
      },
      winner: null,
      humanRole,
      devOptions: { alwaysRevealMisterX }
    }));
  }

  // ---------------------------------------------------------------------
  // Zugvalidierung – der zentrale Baustein für diesen Schritt
  // ---------------------------------------------------------------------

  /**
   * Prüft, ob ein Detektiv von seiner aktuellen Position mit dem gegebenen
   * Verkehrsmittel zur Zielstation ziehen darf. Deckt ab:
   *  - direkte Kante im Graphen vorhanden?
   *  - Ticket im Bestand des Detektivs vorhanden?
   *  - Zielstation frei von einem anderen Detektiv? ("Auf einem Punkt dürfen nie
   *    zwei Spielfiguren stehen", Anleitung S.4 – gilt NICHT für Mister X)
   *  - ist der Detektiv überhaupt am Zug?
   */
  validateDetectiveMove(
    detectiveId: string,
    toStation: number,
    transport: TransportType
  ): MoveValidationResult {
    const state = this.store.gameState();

    if (state.phase !== 'detectiveMove') {
      return { valid: false, reason: 'Gerade sind nicht die Detektive am Zug.' };
    }
    if (state.currentTurn !== detectiveId) {
      return { valid: false, reason: 'Dieser Detektiv ist nicht an der Reihe (Uhrzeigersinn beachten).' };
    }

    const detective = state.detectives.find(d => d.id === detectiveId);
    if (!detective) {
      return { valid: false, reason: `Unbekannter Detektiv: ${detectiveId}` };
    }

    if (transport === TransportType.Black || transport === TransportType.Boot) {
      return { valid: false, reason: 'Detektive dürfen weder Black Tickets noch das Boot benutzen.' };
    }

    if (!this.graph.hasDirectConnection(detective.position, toStation, transport)) {
      return {
        valid: false,
        reason: `Keine ${transport}-Verbindung von Station ${detective.position} nach ${toStation}.`
      };
    }

    if (detective.tickets[transport] <= 0) {
      return { valid: false, reason: `Kein ${transport}-Ticket mehr im Bestand.` };
    }

    const occupiedByOtherDetective = state.detectives.some(
      d => d.id !== detectiveId && d.position === toStation
    );
    if (occupiedByOtherDetective) {
      return { valid: false, reason: `Station ${toStation} ist bereits von einem anderen Detektiv besetzt.` };
    }

    return { valid: true };
  }

  /**
   * Prüft einen Mister-X-Zug. Mister X unterliegt keiner Belegungsprüfung
   * (Detektive und Mister X dürfen auf derselben Station stehen, ohne dass das
   * automatisch das Spielende auslöst – die Aufdeckung erfolgt separat).
   */
  validateMisterXMove(toStation: number, transport: TransportType): MoveValidationResult {
    const state = this.store.gameState();

    if (state.phase !== 'misterXMove') {
      return { valid: false, reason: 'Mister X ist gerade nicht am Zug.' };
    }

    if (transport === TransportType.Black) {
      const anyConnection = this.graph.getNeighbors(state.misterX.position).some(n => n.to === toStation);
      if (!anyConnection) {
        return { valid: false, reason: `Keine Verbindung (auch nicht per Black Ticket) nach ${toStation}.` };
      }
      if (state.misterX.tickets.black <= 0) {
        return { valid: false, reason: 'Keine Black Tickets mehr im Bestand.' };
      }
      return { valid: true };
    }

    if (!this.graph.hasDirectConnection(state.misterX.position, toStation, transport)) {
      return {
        valid: false,
        reason: `Keine ${transport}-Verbindung von Station ${state.misterX.position} nach ${toStation}.`
      };
    }
    if (transport === TransportType.Boot) {
      return { valid: false, reason: 'Das Boot darf nur mit einem Black Ticket befahren werden.' };
    }
    // WICHTIG: Kein Ticket-Bestandscheck für Taxi/Bus/U-Bahn bei Mister X – laut Anleitung
    // ("Der Ticket-Vorrat", S.6) stehen ihm diese drei Verkehrsmittel UNBEGRENZT zur Verfügung
    // (er nutzt implizit die von den Detektiven abgegebenen Tickets nach). Einzige Ausnahme
    // sind Black Tickets, die oben bereits separat auf Bestand geprüft werden.

    return { valid: true };
  }

  /** True, sobald die aktuelle Runde eine Auftauch-Runde ist (3, 8, 13, 18 oder letzte Runde). */
  isRevealRound(round: number): boolean {
    const state = this.store.gameState();
    return state.revealRounds.includes(round) || round === state.maxRounds;
  }

  // ---------------------------------------------------------------------
  // Zugausführung – Mister X (einfach)
  // ---------------------------------------------------------------------

  executeMisterXMove(toStation: number, transport: TransportType): void {
    const validation = this.validateMisterXMove(toStation, transport);
    if (!validation.valid) {
      throw new Error(`Ungültiger Mister-X-Zug: ${validation.reason}`);
    }

    this.store.patch(state => {
      const round = state.round + 1;
      const revealed = state.revealRounds.includes(round) || round === state.maxRounds;
      const logEntry: MisterXLogEntry = {
        round,
        transportUsed: transport,
        transportRevealed: transport !== TransportType.Black,
        revealedStation: revealed ? toStation : null,
        isDoubleMoveEntry: false
      };

      return {
        ...state,
        round,
        misterX: {
          position: toStation,
          tickets: this.decrementMisterXTicket(state.misterX.tickets, transport),
          moveLog: [...state.misterX.moveLog, logEntry]
        },
        phase: 'detectiveMove',
        currentTurn: state.detectiveOrder[0]
      };
    });

    this.refreshDetectiveCanMoveFlags();
    this.checkMisterXCaughtByStandingDetective();
  }

  // ---------------------------------------------------------------------
  // Zugausführung – Mister X (Doppelzug)
  // ---------------------------------------------------------------------

  /** Prüft beide Teilzüge eines Doppelzugs, ausgehend von der aktuellen Mister-X-Position. */
  validateMisterXDoubleMove(step1: MoveOption, step2: MoveOption): MoveValidationResult {
    const state = this.store.gameState();
    if (state.phase !== 'misterXMove') {
      return { valid: false, reason: 'Mister X ist gerade nicht am Zug.' };
    }
    if (state.misterX.tickets.doubleMoves <= 0) {
      return { valid: false, reason: 'Keine Doppelzugkarte mehr verfügbar.' };
    }

    const firstCheck = this.validateSingleHop(state.misterX.position, step1.to, step1.transport, state.misterX.tickets);
    if (!firstCheck.valid) {
      return { valid: false, reason: `Erster Teilzug ungültig: ${firstCheck.reason}` };
    }

    const ticketsAfterFirst = this.decrementMisterXTicket(state.misterX.tickets, step1.transport);
    const secondCheck = this.validateSingleHop(step1.to, step2.to, step2.transport, ticketsAfterFirst);
    if (!secondCheck.valid) {
      return { valid: false, reason: `Zweiter Teilzug ungültig: ${secondCheck.reason}` };
    }

    return { valid: true };
  }

  executeMisterXDoubleMove(step1: MoveOption, step2: MoveOption): void {
    const validation = this.validateMisterXDoubleMove(step1, step2);
    if (!validation.valid) {
      throw new Error(`Ungültiger Doppelzug: ${validation.reason}`);
    }

    this.store.patch(state => {
      let tickets: TicketInventory = {
        ...state.misterX.tickets,
        doubleMoves: state.misterX.tickets.doubleMoves - 1
      };
      const newLogEntries: MisterXLogEntry[] = [];
      let round = state.round;
      let position = state.misterX.position;

      for (const step of [step1, step2]) {
        round++;
        const revealed = state.revealRounds.includes(round) || round === state.maxRounds;
        newLogEntries.push({
          round,
          transportUsed: step.transport,
          transportRevealed: step.transport !== TransportType.Black,
          revealedStation: revealed ? step.to : null,
          isDoubleMoveEntry: true
        });
        tickets = this.decrementMisterXTicket(tickets, step.transport);
        position = step.to;
      }

      return {
        ...state,
        round,
        misterX: {
          position,
          tickets,
          moveLog: [...state.misterX.moveLog, ...newLogEntries]
        },
        phase: 'detectiveMove',
        currentTurn: state.detectiveOrder[0]
      };
    });

    this.refreshDetectiveCanMoveFlags();
    this.checkMisterXCaughtByStandingDetective();
  }

  // ---------------------------------------------------------------------
  // Zugausführung – Detektive
  // ---------------------------------------------------------------------

  executeDetectiveMove(detectiveId: string, toStation: number, transport: TransportType): void {
    const validation = this.validateDetectiveMove(detectiveId, toStation, transport);
    if (!validation.valid) {
      throw new Error(`Ungültiger Detektiv-Zug: ${validation.reason}`);
    }

    this.store.patch(state => {
      const detectives = state.detectives.map(d => {
        if (d.id !== detectiveId) return d;
        return {
          ...d,
          position: toStation,
          tickets: {
            ...d.tickets,
            [transport]: d.tickets[transport as TransportType.Taxi | TransportType.Bus | TransportType.UBahn] - 1
          }
        };
      });

      return { ...state, detectives };
    });

    this.checkDetectiveCaughtMisterX(detectiveId, toStation);
    if (this.store.gameState().phase === 'gameOver') return;

    this.advanceToNextDetectiveOrMisterX();
    this.refreshDetectiveCanMoveFlags();
    this.checkAllDetectivesStuck();
  }

  /**
   * Ein Detektiv OHNE gültigen Zug muss laut Anleitung am zuletzt erreichten Punkt
   * stehenbleiben – die UI ruft stattdessen diese Methode auf, um die Runde
   * weiterzugeben, ohne Position/Tickets zu verändern.
   */
  skipDetectiveTurn(detectiveId: string): void {
    const state = this.store.gameState();
    if (state.currentTurn !== detectiveId || state.phase !== 'detectiveMove') {
      throw new Error('Dieser Detektiv ist gerade nicht am Zug.');
    }
    const detective = state.detectives.find(d => d.id === detectiveId);
    if (detective?.canMove) {
      throw new Error('Dieser Detektiv hat noch gültige Züge und darf nicht aussetzen.');
    }
    this.advanceToNextDetectiveOrMisterX();
    this.checkAllDetectivesStuck();
  }

  /** Liefert alle für einen Detektiv aktuell gültigen Ziel/Verkehrsmittel-Kombinationen. */
  getValidMovesForDetective(detectiveId: string): MoveOption[] {
    const state = this.store.gameState();
    const detective = state.detectives.find(d => d.id === detectiveId);
    if (!detective) return [];

    const occupied = new Set(
      state.detectives.filter(d => d.id !== detectiveId).map(d => d.position)
    );

    return this.graph
      .getNeighbors(detective.position)
      .filter(n => n.transport !== TransportType.Boot) // Boot ist Mister-X-exklusiv
      .filter(n => detective.tickets[n.transport as keyof TicketInventory] as number > 0)
      .filter(n => !occupied.has(n.to))
      .map(n => ({ to: n.to, transport: n.transport }));
  }

  /**
   * Liefert alle für Mister X aktuell gültigen Ziele für EIN gewähltes Verkehrsmittel.
   * Die UI lässt Mister X zuerst ein Verkehrsmittel wählen (wie beim "Ansagen" im
   * Original) und zeigt danach nur die damit erreichbaren Stationen an.
   */
  getValidMovesForMisterX(selectedTransport: TransportType): MoveOption[] {
    const state = this.store.gameState();
    const from = state.misterX.position;

    if (selectedTransport === TransportType.Black) {
      if (state.misterX.tickets.black <= 0) return [];
      const seen = new Set<number>();
      const result: MoveOption[] = [];
      for (const n of this.graph.getNeighbors(from)) {
        if (!seen.has(n.to)) {
          seen.add(n.to);
          result.push({ to: n.to, transport: TransportType.Black });
        }
      }
      return result;
    }

    if (selectedTransport === TransportType.Boot) {
      return []; // Boot ist nur über Black Ticket ansteuerbar, kein eigener Menüpunkt
    }

    // Taxi/Bus/U-Bahn sind bei Mister X unbegrenzt (siehe Anleitung, "Der Ticket-Vorrat") –
    // kein Bestandscheck nötig, nur die Kante muss existieren.
    return this.graph
      .getNeighbors(from)
      .filter(n => n.transport === selectedTransport)
      .map(n => ({ to: n.to, transport: selectedTransport }));
  }

  /**
   * Für den zweiten Teilzug eines Doppelzugs: gültige Ziele ausgehend von einer
   * hypothetischen Zwischenposition (Ergebnis des ersten Teilzugs), unter
   * Berücksichtigung der nach dem ersten Teilzug verbleibenden Tickets.
   */
  getValidSecondHopOptions(fromStation: number, selectedTransport: TransportType, ticketsAfterFirstHop: TicketInventory): MoveOption[] {
    if (selectedTransport === TransportType.Black) {
      if (ticketsAfterFirstHop.black <= 0) return [];
      const seen = new Set<number>();
      const result: MoveOption[] = [];
      for (const n of this.graph.getNeighbors(fromStation)) {
        if (!seen.has(n.to)) {
          seen.add(n.to);
          result.push({ to: n.to, transport: TransportType.Black });
        }
      }
      return result;
    }
    if (selectedTransport === TransportType.Boot) return [];
    // Taxi/Bus/U-Bahn sind bei Mister X unbegrenzt, siehe getValidMovesForMisterX.
    return this.graph
      .getNeighbors(fromStation)
      .filter(n => n.transport === selectedTransport)
      .map(n => ({ to: n.to, transport: selectedTransport }));
  }

  private validateSingleHop(
    from: number,
    to: number,
    transport: TransportType,
    tickets: TicketInventory
  ): MoveValidationResult {
    if (transport === TransportType.Black) {
      const anyConnection = this.graph.getNeighbors(from).some(n => n.to === to);
      if (!anyConnection) return { valid: false, reason: `Keine Verbindung von ${from} nach ${to}.` };
      if (tickets.black <= 0) return { valid: false, reason: 'Keine Black Tickets mehr im Bestand.' };
      return { valid: true };
    }
    if (!this.graph.hasDirectConnection(from, to, transport)) {
      return { valid: false, reason: `Keine ${transport}-Verbindung von ${from} nach ${to}.` };
    }
    if (transport === TransportType.Boot) {
      return { valid: false, reason: 'Das Boot darf nur mit einem Black Ticket befahren werden.' };
    }
    // Taxi/Bus/U-Bahn sind bei Mister X unbegrenzt, siehe validateMisterXMove.
    return { valid: true };
  }

  /**
   * Aktualisiert Mister X' Ticket-Bestand nach einem Zug. WICHTIG: Taxi/Bus/U-Bahn
   * werden NICHT verringert – sie sind laut Anleitung unbegrenzt (er nutzt implizit
   * die von den Detektiven abgegebenen Tickets nach). Nur Black Tickets sind ein
   * echt begrenzter Bestand und werden hier tatsächlich verbraucht.
   */
  private decrementMisterXTicket(tickets: TicketInventory, transport: TransportType): TicketInventory {
    if (transport === TransportType.Black) {
      return { ...tickets, black: tickets.black - 1 };
    }
    return tickets;
  }

  private advanceToNextDetectiveOrMisterX(): void {
    this.store.patch(state => {
      const currentIndex = state.detectiveOrder.indexOf(state.currentTurn);
      const nextIndex = currentIndex + 1;

      if (nextIndex >= state.detectiveOrder.length) {
        // alle Detektive waren dran -> zurück zu Mister X
        if (state.round >= state.maxRounds) {
          // Letzte Auftauch-Runde war bereits abgehandelt und keiner hat gefangen -> Mister X gewinnt
          return { ...state, phase: 'gameOver', winner: 'misterX' };
        }
        return { ...state, phase: 'misterXMove', currentTurn: 'misterX' };
      }

      return { ...state, currentTurn: state.detectiveOrder[nextIndex] };
    });
  }

  /** Aktualisiert canMove für alle Detektive anhand des aktuellen Boards/Ticket-Standes. */
  private refreshDetectiveCanMoveFlags(): void {
    this.store.patch(state => ({
      ...state,
      detectives: state.detectives.map(d => ({
        ...d,
        canMove: this.getValidMovesForDetective(d.id).length > 0
      }))
    }));
  }

  private checkDetectiveCaughtMisterX(detectiveId: string, toStation: number): void {
    const state = this.store.gameState();
    if (toStation === state.misterX.position) {
      this.store.patch(s => ({ ...s, phase: 'gameOver', winner: 'detectives' }));
    }
  }

  /**
   * Deckt den Fall ab, dass Mister X in eine Station zieht, auf der bereits ein
   * Detektiv steht (statt umgekehrt). Auch das beendet laut Anleitung sofort das
   * Spiel zugunsten der Detektive.
   */
  private checkMisterXCaughtByStandingDetective(): void {
    const state = this.store.gameState();
    if (state.detectives.some(d => d.position === state.misterX.position)) {
      this.store.patch(s => ({ ...s, phase: 'gameOver', winner: 'detectives' }));
    }
  }

  /** Spielende, wenn ALLE Detektive gleichzeitig keinen gültigen Zug mehr haben. */
  private checkAllDetectivesStuck(): void {
    const state = this.store.gameState();
    const anyoneCanMove = state.detectives.some(d => this.getValidMovesForDetective(d.id).length > 0);
    if (!anyoneCanMove) {
      this.store.patch(s => ({ ...s, phase: 'gameOver', winner: 'misterX' }));
    }
  }
}
