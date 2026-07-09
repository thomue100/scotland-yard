import { GameGraphService } from './app/core/services/game-graph.service';
import { GameStateStore } from './app/core/services/game-state.store';
import { GameEngineService } from './app/core/services/game-engine.service';
import { GraphMetricsService } from './app/core/services/graph-metrics.service';
import { DetectiveAiStrategyService } from './app/ai/strategies/detective-ai-strategy.service';
import { MisterXNaiveStrategyService } from './app/ai/strategies/mister-x-naive-strategy.service';
import { MisterXHeuristicStrategyService } from './app/ai/strategies/mister-x-heuristic-strategy.service';
import { MisterXStrategy } from './app/ai/strategies/strategy.types';

const graph = new GameGraphService();
const store = new GameStateStore();
const engine = new GameEngineService(graph, store);
const metrics = new GraphMetricsService(graph);
const detectiveAi = new DetectiveAiStrategyService(store, engine, graph, metrics);
const misterXNaive = new MisterXNaiveStrategyService(store, engine, metrics);
const misterXHeuristic = new MisterXHeuristicStrategyService(store, engine, metrics, graph);

console.log('--- Degree-Centrality Top 10 (Phase A Kandidaten) ---');
console.log(metrics.getTopCentralStations(10));

function runOneGame(seed: number, misterXAi: MisterXStrategy, verbose: boolean): { winner: string | null; rounds: number } {
  // Seed-basierte, aber reproduzierbare "Zufalls"-Startpositionen (einfacher LCG),
  // damit die 20 Simulationen tatsächlich unterschiedliche Szenarien testen statt
  // 20x dasselbe deterministische Spiel zu wiederholen.
  let rngState = seed * 9301 + 49297;
  const nextRandomStation = (): number => {
    rngState = (rngState * 9301 + 49297) % 233280;
    return 1 + Math.floor((rngState / 233280) * 199);
  };
  const distinctStations = new Set<number>();
  while (distinctStations.size < 5) distinctStations.add(nextRandomStation());
  const [misterXStart, ...detectiveStarts] = Array.from(distinctStations);

  const colors: ('rot' | 'blau' | 'gruen' | 'gelb')[] = ['rot', 'blau', 'gruen', 'gelb'];
  engine.startNewGame(
    'klassisch',
    colors.map((color, i) => ({ color, startStation: detectiveStarts[i] })),
    misterXStart
  );
  detectiveAi.invalidatePlan();

  let safety = 0;
  while (store.gameState().phase !== 'gameOver' && safety < 500) {
    safety++;
    const state = store.gameState();

    if (state.phase === 'misterXMove') {
      const decision = misterXAi.decideMove();
      if (!decision) {
        if (verbose) console.log('Mister X hat keinen gültigen Zug mehr.');
        break;
      }
      if (decision.secondMove) {
        engine.executeMisterXDoubleMove(decision.move, decision.secondMove);
      } else {
        engine.executeMisterXMove(decision.move.to, decision.move.transport);
      }
      if (verbose) {
        const t = store.gameState().misterX.tickets;
        console.log(`Runde ${store.gameState().round}: ${decision.rationale}`);
        console.log(`  [Tickets danach] Taxi:${t.Taxi} Bus:${t.Bus} U-Bahn:${t['U-Bahn']} Black:${t.black} Doppelzug:${t.doubleMoves}`);
      }
    } else if (state.phase === 'detectiveMove') {
      const detectiveId = state.currentTurn;
      const decision = detectiveAi.decideMove(detectiveId);
      if (decision) {
        engine.executeDetectiveMove(detectiveId, decision.move.to, decision.move.transport);
        if (verbose) console.log('  ' + decision.rationale);
      } else {
        engine.skipDetectiveTurn(detectiveId);
        if (verbose) console.log(`  Detektiv ${detectiveId} setzt aus (kein gültiger Zug).`);
      }
    }
  }

  const finalState = store.gameState();
  return { winner: finalState.winner, rounds: finalState.round };
}

function runComparison(label: string, strategy: MisterXStrategy, n: number): void {
  let detectiveWins = 0;
  let misterXWins = 0;
  const roundsToWin: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = runOneGame(i + 1, strategy, false);
    if (r.winner === 'detectives') {
      detectiveWins++;
      roundsToWin.push(r.rounds);
    } else if (r.winner === 'misterX') {
      misterXWins++;
    }
  }
  console.log(`\n--- ${label}: ${n} Simulationen (unterschiedliche Startpositionen) ---`);
  console.log(`Detektive gewonnen: ${detectiveWins}/${n}`);
  console.log(`Mister X gewonnen: ${misterXWins}/${n}`);
  console.log('Runden bis Fang (bei Detektiv-Siegen):', roundsToWin);
  console.log(
    'Durchschnittliche Runden bis Fang:',
    roundsToWin.length > 0 ? (roundsToWin.reduce((a, b) => a + b, 0) / roundsToWin.length).toFixed(1) : 'n/a'
  );
}

console.log('\n--- Einzelspiel mit Log (Heuristik-Strategie, seed 1) ---');
const result = runOneGame(1, misterXHeuristic, true);
console.log('\nErgebnis:', result);

runComparison('Naive Mister-X-Strategie', misterXNaive, 30);
runComparison('Heuristik Mister-X-Strategie', misterXHeuristic, 30);
