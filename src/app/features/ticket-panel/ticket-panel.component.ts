import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TicketInventory } from '../../core/models/ticket.model';
import { TransportType } from '../../core/enums/transport-type.enum';
import { DetectiveColor } from '../../core/models/player.model';

interface TicketRow {
  label: string;
  count: number;
  colorVar: string;
}

@Component({
  selector: 'app-ticket-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-panel.component.html',
  styleUrl: './ticket-panel.component.scss'
})
export class TicketPanelComponent {
  @Input({ required: true }) tickets!: TicketInventory;
  @Input() ownerLabel = '';
  @Input() ownerColor: DetectiveColor | 'mister-x' | null = null;
  @Input() showSpecialTickets = false; // Black/Doppelzug nur bei Mister X

  get rows(): TicketRow[] {
    const base: TicketRow[] = [
      { label: 'Taxi', count: this.tickets[TransportType.Taxi], colorVar: '--sy-gelb' },
      { label: 'Bus', count: this.tickets[TransportType.Bus], colorVar: '--sy-gruen' },
      { label: 'U-Bahn', count: this.tickets[TransportType.UBahn], colorVar: '--sy-rot' }
    ];
    if (this.showSpecialTickets) {
      base.push(
        { label: 'Black', count: this.tickets.black, colorVar: '--sy-schwarz' },
        { label: 'Doppelzug', count: this.tickets.doubleMoves, colorVar: '--sy-brass' }
      );
    }
    return base;
  }
}
