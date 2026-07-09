import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { GameGraphService } from '../../core/services/game-graph.service';
import { BoardVariant } from '../../core/models/station.model';
import { Detective } from '../../core/models/player.model';
import { TransportType } from '../../core/enums/transport-type.enum';
import { MoveOption } from '../../core/services/game-engine.service';

/**
 * Gemeinsame Viewbox für beide Spielplan-Grafiken.
 * Beide Boards sind als 1024x768-JPEG hinterlegt (Seitenverhältnis 4:3).
 * 1520x1140 hat exakt dasselbe Seitenverhältnis, daher lässt sich das Bild
 * verzerrungsfrei über die gesamte Viewbox strecken ("preserveAspectRatio=none")
 * und die Original-Stationskoordinaten (die bis 1493/1115 reichen) passen
 * unverändert – ohne Skalierungsfaktor-Rätselraten – auf die aufgedruckten Punkte.
 */
export const BOARD_VIEWBOX_WIDTH = 1520;
export const BOARD_VIEWBOX_HEIGHT = 1140;

/**
 * Größe der Spielfiguren-Grafiken (PNG, 39x68px nativ).
 *
 * ANKERPUNKT-KORREKTUR: Die ursprünglich mitgelieferten offset_x/offset_y-Werte
 * aus den Rohdaten führten dazu, dass die Figuren sichtbar ÜBER der Station
 * schweben statt exakt darauf zu stehen. Eine Pixel-Analyse der PNGs zeigt:
 * Es handelt sich um Pin-Marker mit einem Kreis-Kopf oben und einem nach unten
 * auslaufenden Schatten – der Boden-Kontaktpunkt liegt am UNTEREN Bildrand
 * (horizontal zentriert), nicht im Bild-Zentrum. Wir verankern die Figur daher
 * bewusst selbst (bottom-center), statt den Rohdaten-Offsets zu vertrauen.
 */
const PAWN_WIDTH = 39;
const PAWN_HEIGHT = 68;

/** Für's Rendering aufbereitete Pawn-Positionsdaten. */
export interface PawnRenderData {
  id: string;
  imageSrc: string;
  x: number;
  y: number;
  label: string;
}

const TRANSPORT_COLOR: Record<TransportType, string> = {
  [TransportType.Taxi]: '#D6A419',
  [TransportType.Bus]: '#2E8B57',
  [TransportType.UBahn]: '#C0392B',
  [TransportType.Boot]: '#2980B9',
  [TransportType.Black]: '#1A1A1A'
};

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss'
})
export class BoardComponent {
  @Input({ required: true }) variant: BoardVariant = 'klassisch';
  @Input() detectives: Detective[] = [];
  /** null = Mister X ist gerade unsichtbar (kein Auftauch, kein Spielende). */
  @Input() misterXVisibleAt: number | null = null;
  /** Aktuell gültige Ziele des am Zug befindlichen Spielers (zum Hervorheben + Klicken). */
  @Input() highlightedMoves: MoveOption[] = [];
  /** Station, von der aus die highlightedMoves gelten (für die Verbindungslinien). */
  @Input() originStation: number | null = null;

  @Output() stationClicked = new EventEmitter<MoveOption>();

  @ViewChild('svgRoot') private svgRoot?: ElementRef<SVGSVGElement>;

  readonly viewBoxWidth = BOARD_VIEWBOX_WIDTH;
  readonly viewBoxHeight = BOARD_VIEWBOX_HEIGHT;
  readonly pawnWidth = PAWN_WIDTH;
  readonly pawnHeight = PAWN_HEIGHT;

  // ---------------------------------------------------------------------
  // Zoom & Pan (siehe Layout-Überarbeitung: Notebook-Bildschirme profitieren
  // stark davon, gezielt in dichte Stationsbereiche hineinzoomen zu können).
  // ---------------------------------------------------------------------
  zoom = 1;
  panX = 0;
  panY = 0;
  private readonly MIN_ZOOM = 0.6;
  private readonly MAX_ZOOM = 5;
  private isDragging = false;
  private isPointerDown = false;
  private pendingPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;
  /** Erst ab dieser Bewegung (in Bildschirm-Pixeln) wird ein Klick als Ziehen/Pan gewertet.
   *  Ohne diese Schwelle wurde JEDE minimale Mausbewegung während eines Klicks (die praktisch
   *  immer passiert) fälschlich als Pan interpretiert, was panX/panY minimal veränderte, dadurch
   *  ein Re-Render der Ziel-Marker auslöste und den eigentlichen Klick auf die Station "verschluckte". */
  private readonly DRAG_THRESHOLD_PX = 4;

  get boardTransform(): string {
    return `translate(${this.panX} ${this.panY}) scale(${this.zoom})`;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.applyZoom(factor, event.clientX, event.clientY);
  }

  zoomIn(): void {
    this.applyZoom(1.25);
  }

  zoomOut(): void {
    this.applyZoom(1 / 1.25);
  }

  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  /**
   * Zoomt um den Faktor "factor". Wenn Bildschirmkoordinaten (clientX/clientY,
   * z. B. von der Mausposition beim Scrollen) übergeben werden, bleibt der
   * Punkt UNTER DEM MAUSZEIGER fix (klassisches "Zoom zum Cursor"), statt dass
   * das Bild einfach zentriert skaliert und der Blick "wegspringt".
   */
  private applyZoom(factor: number, clientX?: number, clientY?: number): void {
    const newZoom = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, this.zoom * factor));
    const actualFactor = newZoom / this.zoom;

    if (clientX !== undefined && clientY !== undefined && this.svgRoot) {
      const svgPoint = this.clientToSvgPoint(clientX, clientY);
      this.panX = svgPoint.x - (svgPoint.x - this.panX) * actualFactor;
      this.panY = svgPoint.y - (svgPoint.y - this.panY) * actualFactor;
    }

    this.zoom = newZoom;
  }

  private clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.svgRoot!.nativeElement.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    return { x: relX * this.viewBoxWidth, y: relY * this.viewBoxHeight };
  }

  onPointerDown(event: PointerEvent): void {
    this.isPointerDown = true;
    this.isDragging = false; // erst bei Überschreiten der Schwelle in onPointerMove aktiv
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
    this.pendingPointerId = event.pointerId;
    // WICHTIG: HIER noch KEIN setPointerCapture. Pointer-Capture sofort bei jedem
    // Pointerdown zu setzen (auch bei einem simplen Klick) hat in der Praxis dazu
    // geführt, dass Chromium das nachfolgende native "click"-Event auf dem
    // Ziel-Marker unterdrückt hat – Stationen ließen sich anklicken (visuell),
    // aber onTargetClick() feuerte nie. Capture wird daher erst unten in
    // onPointerMove aktiviert, in genau dem Moment, in dem wir ECHTES Ziehen
    // erkennen (Schwelle überschritten). Ein reiner Klick fasst die Pointer-
    // Capture-API also nie an.
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.isPointerDown || !this.svgRoot) return;

    const dxScreen = event.clientX - this.dragStartX;
    const dyScreen = event.clientY - this.dragStartY;

    if (!this.isDragging) {
      if (Math.hypot(dxScreen, dyScreen) < this.DRAG_THRESHOLD_PX) return; // noch kein "echtes" Ziehen
      this.isDragging = true;
      if (this.pendingPointerId !== null) {
        this.svgRoot.nativeElement.setPointerCapture?.(this.pendingPointerId);
      }
    }

    const rect = this.svgRoot.nativeElement.getBoundingClientRect();
    const scaleX = this.viewBoxWidth / rect.width;
    const scaleY = this.viewBoxHeight / rect.height;
    this.panX = this.panStartX + dxScreen * scaleX;
    this.panY = this.panStartY + dyScreen * scaleY;
  }

  onPointerUp(event: PointerEvent): void {
    if (this.isDragging && this.svgRoot && this.pendingPointerId !== null) {
      this.svgRoot.nativeElement.releasePointerCapture?.(this.pendingPointerId);
    }
    this.isPointerDown = false;
    this.isDragging = false;
    this.pendingPointerId = null;
  }

  constructor(private readonly graph: GameGraphService) {}

  get boardImageSrc(): string {
    return `assets/board/spielplan-${this.variant}.jpg`;
  }

  get highlightedTargets(): { move: MoveOption; x: number; y: number; color: string }[] {
    return this.highlightedMoves
      .map(m => {
        const station = this.graph.getStation(this.variant, m.to);
        if (!station) return null;
        return { move: m, x: station.x, y: station.y, color: TRANSPORT_COLOR[m.transport] };
      })
      .filter((v): v is { move: MoveOption; x: number; y: number; color: string } => v !== null);
  }

  get connectorLines(): { x1: number; y1: number; x2: number; y2: number; color: string }[] {
    if (this.originStation === null) return [];
    const origin = this.graph.getStation(this.variant, this.originStation);
    if (!origin) return [];
    return this.highlightedTargets.map(t => ({
      x1: origin.x,
      y1: origin.y,
      x2: t.x,
      y2: t.y,
      color: t.color
    }));
  }

  /** Platziert eine Spielfigur so, dass ihr Boden-Kontaktpunkt exakt auf der Station liegt. */
  private anchorPawn(stationX: number, stationY: number): { x: number; y: number } {
    return {
      x: stationX - PAWN_WIDTH / 2,
      y: stationY - PAWN_HEIGHT
    };
  }

  get detectivePawns(): PawnRenderData[] {
    return this.detectives.map(d => {
      const station = this.graph.getStation(this.variant, d.position);
      const pos = this.anchorPawn(station?.x ?? 0, station?.y ?? 0);
      return {
        id: d.id,
        imageSrc: `assets/pawns/detective-${d.color}.png`,
        x: pos.x,
        y: pos.y,
        label: d.color
      };
    });
  }

  get misterXPawn(): PawnRenderData | null {
    if (this.misterXVisibleAt === null) return null;
    const station = this.graph.getStation(this.variant, this.misterXVisibleAt);
    if (!station) return null;
    const pos = this.anchorPawn(station.x, station.y);
    return {
      id: 'mister-x',
      imageSrc: 'assets/pawns/mr-x.png',
      x: pos.x,
      y: pos.y,
      label: 'Mister X'
    };
  }

  onTargetClick(move: MoveOption): void {
    this.stationClicked.emit(move);
  }

  trackByStationId(_index: number, item: { move: MoveOption }): number {
    return item.move.to;
  }

  trackByPawnId(_index: number, item: PawnRenderData): string {
    return item.id;
  }
}
