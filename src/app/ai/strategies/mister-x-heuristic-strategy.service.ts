import { Injectable } from '@angular/core';
import { GameStateStore } from '../../core/services/game-state.store';
import { GameEngineService, MoveOption } from '../../core/services/game-engine.service';
import { GraphMetricsService } from '../../core/services/graph-metrics.service';
import { GameGraphService } from '../../core/services/game-graph.service';
import { TransportType } from '../../core/enums/transport-type.enum';
import { TicketInventory, createMisterXTickets } from '../../core/models/ticket.model';
import { AiDecision, MisterXStrategy } from './strategy.types';

/**
 * ============================================================================
 * MISTER-X-FLUCHTSTRATEGIE ("Heuristic") – ÜBERSICHT
 * ============================================================================
 *
 * Anders als die Naiv-Strategie (die nur die Summe der Detektiv-Distanzen
 * maximiert) bewertet diese Strategie jeden möglichen Zug anhand von VIER
 * Kriterien gleichzeitig:
 *
 * 1. SICHERHEIT – Mindestabstand zum NÄCHSTEN Detektiv maximieren (nicht die
 *    Summe!). Die Summe kann täuschen: 4 Detektive weit weg + 1 direkt daneben
 *    ergibt eine hohe Summe, ist aber lebensgefährlich. Das Minimum bildet die
 *    tatsächliche Gefahr realistischer ab ("worst case").
 *
 * 2. BEWEGUNGSFREIHEIT – Degree-Centrality der Zielstation. Eine Station mit
 *    nur 1-2 Verbindungen ist eine Sackgasse: gerät Mister X dort in die
 *    Enge, hat er keine Ausweichmöglichkeit mehr. Zielstationen mit vielen
 *    Verbindungen werden bevorzugt.
 *
 * 3. TICKET-KONSERVIERUNG – Taxi-Tickets sind mit nur 4 Stück das knappste
 *    Kontingent, obwohl Taxi-Verbindungen am Spielplan am häufigsten sind
 *    ("Gelb ist bei allen Punkten vertreten", siehe Anleitung S.6). Diese
 *    Strategie bevorzugt daher Bus/U-Bahn, wann immer eine gleichwertige
 *    Alternative existiert, um Taxi-Tickets für Notfälle aufzusparen.
 *
 * 4. VERSCHLEIERUNG – Black Tickets verstecken das benutzte Verkehrsmittel
 *    vor den Detektiven (die sonst aus der Fahrtentafel exakt mitzählen
 *    können, welche Tickets Mister X noch hat, siehe
 *    DetectiveAiStrategyService.computeMisterXKnownRemainingTickets()).
 *    Black wird gezielt dann eingesetzt, wenn entweder (a) die Gefahr hoch
 *    ist (bester regulärer Zug bleibt riskant) oder (b) kurz VOR einer
 *    Auftauch-Runde, um die Ticket-Bilanz der Detektive zu verwässern.
 *    Doppelzüge werden bevorzugt direkt NACH einer Auftauch-Runde eingesetzt
 *    (Regel: bei Doppelzug zeigt er sich nur beim ersten Teilzug, wenn der
 *    auf eine Auftauch-Station fällt, und verschwindet mit dem zweiten sofort
 *    wieder – ideal, um den kurz zuvor verratenen Standort zu verlassen).
 * ============================================================================
 */
@Injectable({ providedIn: 'root' })
export class MisterXHeuristicStrategyService implements MisterXStrategy {
  readonly id = 'misterx-heuristic-v1';
  readonly label = 'Fluchtheuristik (Sicherheit + Sackgassen + Ticket-Konservierung)';
  readonly description =
    'Maximiert den Mindestabstand zum nächsten Detektiv, meidet Sackgassen, spart Taxi-Tickets ' +
    'für Notfälle und setzt Black/Doppelzug gezielt zur Verschleierung ein.';

  private readonly W_SAFETY = 3.0;       // Gewicht: Mindestabstand zum nächsten Detektiv
  private readonly W_CENTRALITY = 0.15;  // Gewicht: Sackgassen-Vermeidung
  private readonly W_SCARCITY = 1.0;     // Gewicht: Ticket-Konservierung (gleiche Größenordnung wie 1 Fahrt)

  /** Black nur einsetzen, wenn der Score-Gewinn ggü. der besten regulären Option diese Schwelle übersteigt. */
  private readonly BLACK_USAGE_MARGIN = 1.5;
  /** Doppelzug nur einsetzen, wenn der Score-Gewinn ggü. einem Einzelzug diese Schwelle übersteigt. */
  private readonly DOUBLE_MOVE_MARGIN = 2.5;

  private readonly initialMisterXTicketsCache = new Map<number, TicketInventory>();

  constructor(
    private readonly store: GameStateStore,
    private readonly engine: GameEngineService,
    private readonly metrics: GraphMetricsService,
    private readonly graph: GameGraphService
  ) {}

  decideMove(): AiDecision | null {
    const state = this.store.gameState();

    const regularBest = this.findBestSingleMove(state.misterX.position, state.misterX.tickets, false);
    const blackBest = state.misterX.tickets.black > 0
      ? this.findBestSingleMove(state.misterX.position, state.misterX.tickets, true)
      : null;

    let best: { move: MoveOption; score: number; rationale: string } | null;

    if (regularBest && blackBest) {
      // Black nur einsetzen, wenn er die Sicherheit deutlich verbessert ODER wir kurz vor
      // einer Auftauch-Runde stehen (Verschleierungs-Wert unabhängig von der reinen Sicherheit).
      const nearReveal = this.isRoundBeforeReveal(state.round, state.revealRounds, state.maxRounds);
      best = (blackBest.score > regularBest.score + this.BLACK_USAGE_MARGIN || (nearReveal && blackBest.score >= regularBest.score))
        ? blackBest
        : regularBest;
    } else {
      // WICHTIG: Fällt auf Black zurück, wenn an der aktuellen Station gar keine regulären
      // Tickets mehr reichen (z. B. nur noch Taxi-Kanten vorhanden, aber Taxi-Kontingent
      // aufgebraucht) – ohne diesen Fallback bricht die Strategie hier fälschlich ab.
      best = regularBest ?? blackBest;
    }

    if (!best) return null; // wirklich kein Zug mehr möglich (weder regulär noch Black)

    // Doppelzug prüfen: lohnt er sich deutlich mehr als der beste Einzelzug?
    if (state.misterX.tickets.doubleMoves > 0) {
      const bestDouble = this.findBestDoubleMove(state);
      if (bestDouble && bestDouble.score > best.score + this.DOUBLE_MOVE_MARGIN) {
        return {
          move: bestDouble.firstMove,
          secondMove: bestDouble.secondMove,
          rationale: bestDouble.rationale
        };
      }
    }

    return { move: best.move, rationale: best.rationale };
  }

  // ---------------------------------------------------------------------
  // Einzelzug-Bewertung
  // ---------------------------------------------------------------------

  private findBestSingleMove(
    from: number,
    tickets: TicketInventory,
    useBlack: boolean
  ): { move: MoveOption; score: number; rationale: string } | null {
    const candidates: MoveOption[] = useBlack
      ? this.engine.getValidMovesForMisterX(TransportType.Black)
      : ([TransportType.Taxi, TransportType.Bus, TransportType.UBahn] as const).flatMap(t =>
          this.engine.getValidMovesForMisterX(t)
        );

    if (candidates.length === 0) return null;

    let bestMove = candidates[0];
    let bestScore = -Infinity;
    let bestBreakdown = '';

    for (const move of candidates) {
      const { score, breakdown } = this.scoreDestination(move.to, move.transport, tickets);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        bestBreakdown = breakdown;
      }
    }

    const rationale =
      `[${this.label}] Fährt mit ${bestMove.transport} nach ${bestMove.to}. ${bestBreakdown}`;

    return { move: bestMove, score: bestScore, rationale };
  }

  /**
   * Bewertet eine Zielstation nach den 4 Kriterien aus dem Klassen-Kommentar.
   * Höherer Score = besser.
   *
   * WICHTIG (Lehre aus der Simulation, siehe dev-tools/ai-smoke-test.ts):
   * Ein Zug, nach dem Mister X garantiert KEINEN gültigen Folgezug mehr hätte
   * (z. B. Zielstation hat nur Taxi-Kanten, aber Taxi-Tickets UND Black wären
   * danach beide aufgebraucht), wird hart abgestraft. Reine Sicherheits-/
   * Zentralitäts-Bewertung allein hatte dazu geführt, dass die KI sich in
   * eine Taxi-Sackgasse manövriert hat, nachdem sie ihre Black Tickets zu
   * freizügig für Verschleierung verbraucht hatte.
   */
  private scoreDestination(
    station: number,
    transport: TransportType,
    ticketsBeforeThisMove: TicketInventory
  ): { score: number; breakdown: string } {
    const minDetectiveDistance = this.computeMinDistanceToDetectives(station);
    const centrality = this.metrics.getDegreeCentrality().get(station) ?? 0;
    const scarcity = this.scarcityPenalty(transport, ticketsBeforeThisMove);

    const ticketsAfterMove = this.applyHypotheticalUse(ticketsBeforeThisMove, transport);
    const strandedPenalty = this.hasAnyContinuation(station, ticketsAfterMove) ? 0 : 1000;

    const safetyScore = minDetectiveDistance * this.W_SAFETY;
    const centralityScore = centrality * this.W_CENTRALITY;
    const scarcityScore = -scarcity * this.W_SCARCITY;

    const total = safetyScore + centralityScore + scarcityScore - strandedPenalty;

    const breakdown =
      `Mindestabstand zum nächsten Detektiv danach: ${minDetectiveDistance} ` +
      `(Bewegungsfreiheit der Zielstation: ${centrality} Verbindungen` +
      (scarcity > 0 ? `, Ticket-Knappheitsabzug: -${scarcity.toFixed(2)}` : '') +
      (strandedPenalty > 0 ? ', ACHTUNG: würde in eine Sackgasse ohne Folgezug führen!' : '') +
      ').';

    return { score: total, breakdown };
  }

  /**
   * Prüft, ob von "station" aus danach ÜBERHAUPT NOCH irgendein Zug möglich wäre
   * (mit den nach diesem Zug verbleibenden Tickets). Verhindert, dass sich die
   * KI selbst in eine Sackgasse manövriert (siehe Kommentar bei scoreDestination).
   *
   * Arbeitet bewusst DIREKT auf dem Graphen (nicht über engine.getValidMovesForMisterX),
   * da wir eine HYPOTHETISCHE Station prüfen, an der Mister X noch gar nicht steht –
   * die Engine kennt nur die tatsächliche aktuelle Position im Store.
   */
  private hasAnyContinuation(station: number, ticketsAfter: TicketInventory): boolean {
    if (ticketsAfter.black > 0) return true; // Black kommt praktisch überall weiter
    for (const edge of this.graph.getNeighbors(station)) {
      if (edge.transport === TransportType.Boot) continue; // Boot braucht ohnehin ein Black Ticket
      if (ticketsAfter[edge.transport as TransportType.Taxi | TransportType.Bus | TransportType.UBahn] > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Mindestabstand von "station" zu JEDEM Detektiv, unter Berücksichtigung
   * von dessen tatsächlichem Ticket-Vorrat (ein Detektiv mit vielen Tickets
   * ist gefährlicher/schneller als einer, dem z. B. die U-Bahn ausgegangen ist).
   * Wir nehmen das MINIMUM über alle Detektive – der nächste/gefährlichste
   * bestimmt das Risiko, nicht der Durchschnitt.
   */
  private computeMinDistanceToDetectives(station: number): number {
    const state = this.store.gameState();
    if (state.detectives.length === 0) return Infinity;

    let min = Infinity;
    for (const detective of state.detectives) {
      const distances = this.metrics.dijkstra(detective.position, detective.tickets).distances;
      const d = distances.get(station) ?? Infinity;
      if (d < min) min = d;
    }
    return min === Infinity ? 99 : min; // unerreichbar = safe genug, mit hohem Ersatzwert
  }

  /**
   * Strafpunkte für die Nutzung eines knappen Verkehrsmittels. Taxi hat nur
   * 4 Tickets im Startkontingent (gegenüber 3 Bus / 3 U-Bahn) UND wird laut
   * Anleitung an praktisch jeder Station angeboten – d. h. Mister X wird
   * ihn implizit oft "automatisch" nutzen wollen, wenn wir nicht gezielt
   * gegensteuern. Deshalb hier bewusst ein spürbarer (nicht nur symbolischer)
   * Aufschlag, größer als bei der Detektiv-Strategie (dort 0.3 max) – Mister X
   * hat mit nur 4 Taxi-Tickets viel weniger Puffer als ein Detektiv mit 10.
   */
  /**
   * Strafpunkte für die Nutzung eines knappen Verkehrsmittels.
   *
   * WICHTIG (Regel-Korrektur): Taxi/Bus/U-Bahn sind bei Mister X laut Anleitung
   * ("Der Ticket-Vorrat", S.6) UNBEGRENZT – er nutzt implizit die von den
   * Detektiven abgegebenen Tickets nach. Eine "Konservierung" dieser drei
   * Verkehrsmittel ergibt daher keinen Sinn und wurde entfernt (frühere Version
   * dieser Strategie hat sich dadurch fälschlich selbst in Sackgassen manövriert,
   * siehe Kommentar bei hasAnyContinuation).
   *
   * Black Tickets SIND dagegen echt begrenzt (= Anzahl Detektive) – hier bleibt
   * die Konservierung wichtig.
   */
  private scarcityPenalty(transport: TransportType, tickets: TicketInventory): number {
    if (transport !== TransportType.Black) return 0;

    const initialBlack = createMisterXTickets(this.store.gameState().detectives.length).black;
    const scarcity = 1 - tickets.black / initialBlack;
    return Math.max(0, scarcity) * 2.0;
  }

  // ---------------------------------------------------------------------
  // Doppelzug-Bewertung
  // ---------------------------------------------------------------------

  private findBestDoubleMove(
    state: ReturnType<GameStateStore['gameState']>
  ): { firstMove: MoveOption; secondMove: MoveOption; score: number; rationale: string } | null {
    const from = state.misterX.position;
    const tickets = state.misterX.tickets;

    const firstHopCandidates: MoveOption[] = ([TransportType.Taxi, TransportType.Bus, TransportType.UBahn] as const)
      .flatMap(t => this.engine.getValidMovesForMisterX(t));

    let best: { firstMove: MoveOption; secondMove: MoveOption; score: number } | null = null;

    for (const first of firstHopCandidates) {
      const ticketsAfterFirst = this.applyHypotheticalUse(tickets, first.transport);
      const secondHopCandidates = this.engine.getValidSecondHopOptions(first.to, first.transport, ticketsAfterFirst);
      // Auch Verkehrsmittelwechsel für den zweiten Schritt zulassen:
      const allSecondHops = ([TransportType.Taxi, TransportType.Bus, TransportType.UBahn] as const)
        .flatMap(t => this.engine.getValidSecondHopOptions(first.to, t, ticketsAfterFirst));

      for (const second of [...secondHopCandidates, ...allSecondHops]) {
        const { score } = this.scoreDestination(second.to, second.transport, this.applyHypotheticalUse(ticketsAfterFirst, second.transport));
        if (!best || score > best.score) {
          best = { firstMove: first, secondMove: second, score };
        }
      }
    }

    if (!best) return null;

    return {
      ...best,
      rationale:
        `[${this.label}] Doppelzug: ${best.firstMove.transport} nach ${best.firstMove.to}, ` +
        `dann ${best.secondMove.transport} nach ${best.secondMove.to} ` +
        `(deutlich sicherer als jeder Einzelzug – lohnt den Verbrauch der Doppelzugkarte).`
    };
  }

  private applyHypotheticalUse(tickets: TicketInventory, transport: TransportType): TicketInventory {
    if (transport === TransportType.Black) {
      return { ...tickets, black: Math.max(tickets.black - 1, 0) };
    }
    return tickets; // Taxi/Bus/U-Bahn/Boot: unbegrenzt bzw. via Black abgedeckt, siehe scarcityPenalty
  }

  /** True, wenn die NÄCHSTE Mister-X-Runde eine Auftauch-Runde wäre (Verschleierungs-Anreiz für Black). */
  private isRoundBeforeReveal(currentRound: number, revealRounds: number[], maxRounds: number): boolean {
    const nextRound = currentRound + 1;
    return revealRounds.includes(nextRound) || nextRound === maxRounds;
  }
}
