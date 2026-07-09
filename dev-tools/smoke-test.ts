import { GameGraphService } from './app/core/services/game-graph.service';
import { GameStateStore } from './app/core/services/game-state.store';
import { GameEngineService } from './app/core/services/game-engine.service';
import { TransportType } from './app/core/enums/transport-type.enum';

const graph = new GameGraphService();
const store = new GameStateStore();
const engine = new GameEngineService(graph, store);

console.log('--- Graph-Aufbau ---');
console.log('Kanten gesamt (inkl. Boot):', graph.getAllConnections().length);
console.log('Station 1 Nachbarn:', graph.getNeighbors(1));
console.log('Asymmetrische Kanten (zur manuellen Prüfung):', graph.asymmetricConnections.length);
console.log(graph.asymmetricConnections);

console.log('\n--- Beispiel aus der Anleitung (S.4) ---');
// "Eine Taxi-Fahrt von Punkt 153 kann zu einem der Punkte 139, 154, 167, 166 oder 152 führen."
const from153Taxi = graph.getNeighbors(153).filter(n => n.transport === TransportType.Taxi).map(n => n.to).sort((a,b)=>a-b);
console.log('Taxi von 153 ->', from153Taxi, '(erwartet: 139,152,154,166,167)');

// "Eine U-Bahn-Fahrt von Punkt 74 ... führt entlang der roten gestrichelten Linie zu Punkt 46."
const from74UBahn = graph.getNeighbors(74).filter(n => n.transport === TransportType.UBahn).map(n => n.to);
console.log('U-Bahn von 74 ->', from74UBahn, '(erwartet: [46])');

// "Eine Taxi-Fahrt von Punkt 74 führt zu Punkt 92 oder 73 oder 58 oder 75."
const from74Taxi = graph.getNeighbors(74).filter(n => n.transport === TransportType.Taxi).map(n => n.to).sort((a,b)=>a-b);
console.log('Taxi von 74 ->', from74Taxi, '(erwartet: 58,73,75,92)');

// "Eine Bus-Fahrt von Punkt 74 führt zu Punkt 58 oder 94."
const from74Bus = graph.getNeighbors(74).filter(n => n.transport === TransportType.Bus).map(n => n.to).sort((a,b)=>a-b);
console.log('Bus von 74 ->', from74Bus, '(erwartet: 58,94)');

console.log('\n--- Boot-Sonderregel ---');
console.log('Von 194 per Boot ->', graph.getNeighbors(194).filter(n => n.transport === TransportType.Boot));
console.log('Von 157 per Boot ->', graph.getNeighbors(157).filter(n => n.transport === TransportType.Boot));

console.log('\n--- Setup + Zugvalidierung ---');
engine.startNewGame(
  'klassisch',
  [
    { color: 'rot', startStation: 74 },
    { color: 'blau', startStation: 58 } // 58 ist per Taxi von 74 aus erreichbar -> testet Belegungsprüfung
  ],
  1
);
// Mister X ist am Zug (Runde 0 -> misterXMove)
console.log('Mister X Taxi 1 -> 8 (gültig, da Kante existiert):', engine.validateMisterXMove(8, TransportType.Taxi));
console.log('Mister X U-Bahn 1 -> 99 (ungültig, keine Kante):', engine.validateMisterXMove(99, TransportType.UBahn));

// Manuell in Detektiv-Phase versetzen, um validateDetectiveMove zu testen
store.patch(s => ({ ...s, phase: 'detectiveMove', currentTurn: 'detective-0' }));
console.log('Detektiv rot (auf 74) Bus -> 58 (gültig):', engine.validateDetectiveMove('detective-0', 58, TransportType.Bus));
console.log('Detektiv rot (auf 74) Bus -> 46 (ungültig, keine Kante):', engine.validateDetectiveMove('detective-0', 46, TransportType.Bus));
console.log('Detektiv rot (auf 74) Taxi -> 58 (ungültig, da 58 von Detektiv blau besetzt):', engine.validateDetectiveMove('detective-0', 58, TransportType.Taxi));
console.log('Detektiv rot Black Ticket (ungültig, Detektive dürfen kein Black nutzen):', engine.validateDetectiveMove('detective-0', 58, TransportType.Black));

console.log('\n--- Vollständiger Zugablauf (execute*) ---');
store.reset();
engine.startNewGame(
  'klassisch',
  [{ color: 'rot', startStation: 1 }],
  1 // Mister X startet auf 1
);
console.log('Runde:', store.round(), 'Phase:', store.phase());

engine.executeMisterXMove(8, TransportType.Taxi); // 1 -> 8
console.log('Nach Mister-X-Zug: Runde', store.round(), 'Phase:', store.phase(), 'Turn:', store.currentTurn());

console.log('Gültige Detektiv-Züge:', engine.getValidMovesForDetective('detective-0'));
engine.executeDetectiveMove('detective-0', 8, TransportType.Taxi); // fängt Mister X!
console.log('Nach Detektiv-Zug: Phase:', store.phase(), 'Winner:', store.winner());

console.log('\nSmoke-Test abgeschlossen.');
