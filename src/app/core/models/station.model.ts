/**
 * Bereinigtes, spielplan-unabhängiges Stations-Modell.
 * x/y sind reine Koordinaten für das Rendering und werden je nach gewähltem Spielplan
 * (klassisch/modern) aus den jeweiligen Rohdaten befüllt.
 */
export interface Station {
  id: number;
  x: number;
  y: number;
  /** "stationswert" aus den Rohdaten – wird für spätere KI-Heuristiken benötigt
   *  (z. B. Bewertung, wie "verkehrsgünstig" eine Station für Mister X ist). */
  value: number;
}

/**
 * Verschiebung, mit der die Spielfigur-Grafik (Pin, 39x68px) auf einer Station
 * platziert werden muss, damit die Pin-Spitze exakt auf dem Stationspunkt sitzt.
 * Kommt 1:1 aus offset_x/offset_y (klassisch) bzw. offset_modern_x/y (modern)
 * aus den Rohdaten – bewusst NICHT auf die Stationskoordinaten selbst angewendet,
 * da diese unverändert mit den auf dem Spielplan aufgedruckten Punkten
 * übereinstimmen müssen (Klick-Trefferflächen, Verbindungslinien etc.).
 */
export interface PawnOffset {
  x: number;
  y: number;
}

export type BoardVariant = 'klassisch' | 'modern';
