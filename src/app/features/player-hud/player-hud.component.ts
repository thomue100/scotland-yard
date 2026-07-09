import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-player-hud',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-hud.component.html',
  styleUrl: './player-hud.component.scss'
})
export class PlayerHudComponent {
  @Input() round = 0;
  @Input() maxRounds = 22;
  @Input() revealRounds: number[] = [3, 8, 13, 18];
  @Input() currentTurnLabel = '';
  @Input() winnerLabel: string | null = null;

  get nextRevealRound(): number | null {
    const upcoming = [...this.revealRounds, this.maxRounds].filter(r => r > this.round);
    return upcoming.length > 0 ? Math.min(...upcoming) : null;
  }
}
