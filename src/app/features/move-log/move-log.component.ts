import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MisterXLogEntry } from '../../core/models/player.model';

@Component({
  selector: 'app-move-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './move-log.component.html',
  styleUrl: './move-log.component.scss'
})
export class MoveLogComponent {
  @Input() entries: MisterXLogEntry[] = [];

  transportSymbol(entry: MisterXLogEntry): string {
    if (!entry.transportRevealed) return '?';
    switch (entry.transportUsed) {
      case 'Taxi': return 'T';
      case 'Bus': return 'B';
      case 'U-Bahn': return 'U';
      case 'Boot': return '~';
      default: return '?';
    }
  }
}
