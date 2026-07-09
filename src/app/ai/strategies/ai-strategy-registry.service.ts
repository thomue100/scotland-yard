import { Injectable, computed, signal } from '@angular/core';
import { DetectiveAiStrategyService } from './detective-ai-strategy.service';
import { DetectiveOmniscientDijkstraStrategyService } from './detective-omniscient-dijkstra-strategy.service';
import { MisterXNaiveStrategyService } from './mister-x-naive-strategy.service';
import { MisterXHeuristicStrategyService } from './mister-x-heuristic-strategy.service';
import { DetectiveStrategy, MisterXStrategy } from './strategy.types';

/**
 * Zentrale Registry für austauschbare KI-Strategien.
 *
 * Warum eine Registry statt die konkrete Strategie-Klasse direkt in
 * GameComponent zu injizieren? Damit sich die AKTIVE Strategie jederzeit
 * (auch mitten in einer laufenden Partie) wechseln lässt, ohne dass die UI
 * wissen muss, wie viele Strategien es gibt oder wie sie heißen – neue
 * Strategien einfach hier registrieren, UI-Dropdown aktualisiert sich von
 * selbst (siehe availableMisterXStrategies/availableDetectiveStrategies).
 */
@Injectable({ providedIn: 'root' })
export class AiStrategyRegistryService {
  private readonly detectiveStrategies: DetectiveStrategy[];
  private readonly misterXStrategies: MisterXStrategy[];

  private readonly selectedDetectiveId = signal<string>('');
  private readonly selectedMisterXId = signal<string>('');

  readonly availableDetectiveStrategies = computed(() => this.detectiveStrategies);
  readonly availableMisterXStrategies = computed(() => this.misterXStrategies);
  readonly activeDetectiveStrategyId = this.selectedDetectiveId.asReadonly();
  readonly activeMisterXStrategyId = this.selectedMisterXId.asReadonly();

  constructor(
    detectiveAi: DetectiveAiStrategyService,
    detectiveOmniscient: DetectiveOmniscientDijkstraStrategyService,
    misterXNaive: MisterXNaiveStrategyService,
    misterXHeuristic: MisterXHeuristicStrategyService
  ) {
    // Neue Strategien künftig einfach hier in die Arrays aufnehmen.
    this.detectiveStrategies = [detectiveAi, detectiveOmniscient];
    this.misterXStrategies = [misterXHeuristic, misterXNaive];

    this.selectedDetectiveId.set(this.detectiveStrategies[0].id);
    this.selectedMisterXId.set(this.misterXStrategies[0].id);
  }

  getActiveDetectiveStrategy(): DetectiveStrategy {
    const found = this.detectiveStrategies.find(s => s.id === this.selectedDetectiveId());
    return found ?? this.detectiveStrategies[0];
  }

  getActiveMisterXStrategy(): MisterXStrategy {
    const found = this.misterXStrategies.find(s => s.id === this.selectedMisterXId());
    return found ?? this.misterXStrategies[0];
  }

  setDetectiveStrategy(id: string): void {
    this.selectedDetectiveId.set(id);
    this.getActiveDetectiveStrategy().invalidatePlan();
  }

  setMisterXStrategy(id: string): void {
    this.selectedMisterXId.set(id);
  }
}
