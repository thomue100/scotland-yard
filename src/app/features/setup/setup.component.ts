import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoardVariant } from '../../core/models/station.model';
import { DetectiveColor } from '../../core/models/player.model';
import { HumanRole } from '../../core/models/game-state.model';

export interface NewGameConfig {
  variant: BoardVariant;
  detectiveSetup: { color: DetectiveColor; startStation: number }[];
  misterXStart: number;
  humanRole: HumanRole;
  alwaysRevealMisterX: boolean;
}

export interface RulebookSection {
  title: string;
  paragraphs: string[];
}

const ALL_COLORS: DetectiveColor[] = ['blau', 'gelb', 'gruen', 'rot', 'schwarz'];

/**
 * Wortwörtlicher Text der Original-Spielanleitung (Ravensburger Spiele Nr. 604 51427,
 * © 1983 by Otto Maier Verlag Ravensburg), wie in Spielanleitung_Scotland_Yard.pdf
 * enthalten. Unverändert übernommen (auch die alte Rechtschreibung, z. B. "muß"),
 * nur in Abschnitte mit Überschriften gegliedert, damit sie sich hier einklappbar
 * anzeigen lässt.
 */
const RULEBOOK_SECTIONS: RulebookSection[] = [
  {
    title: 'Wo ist „Mister X"?',
    paragraphs: [
      'Im Zentrum von London fällt es nicht schwer, im Verkehrsgewühl unterzutauchen. Wenn sich hier einer unsichtbar machen will, braucht man schon die Findigkeit der berühmten Detektive von Scotland Yard, um ihn vielleicht doch aufzuspüren.',
      'Einer der Spieler ist „Mister X" und versteckt sich auf seiner Flucht kreuz und quer durch London. Er zieht „unsichtbar" und zeigt sich nur in bestimmten Abständen. Alle anderen Spieler sind die Detektive von Scotland Yard und sind hinter ihm her, um ihn zu finden.'
    ]
  },
  {
    title: 'Ziel des Spiels',
    paragraphs: [
      'Gelingt es einem Detektiv, mit dem unsichtbaren „Mister X" auf einem Punkt zusammenzutreffen, muß sich „Mister X" zeigen, und die Detektive haben gewonnen. Wenn es dagegen „Mister X" gelingt, unentdeckt zu bleiben, bis die Detektive alle ihre Tickets und damit alle Zugmöglichkeiten aufgebraucht haben, dann hat „Mister X" gewonnen.'
    ]
  },
  {
    title: 'Vorbereitung',
    paragraphs: [
      'Vor dem ersten Spiel werden alle Karten aus den beiden Stanztafeln gelöst und in die Fächer in der Schachtel einsortiert.',
      'Die Spieler entscheiden, wer „Mister X" sein soll. Dieser erhält die farblose Spielfigur und die Fahrtentafel, in die er ein Blatt Papier einlegt. Für seine Notizen braucht er einen Bleistift. „Mister X" erhält so viele Black Tickets, wie Detektive am Spiel teilnehmen; außerdem 4 Taxi-Tickets, 3 Bus-Tickets, 3 U-Bahn-Tickets (Underground) und die beiden Doppelzugkarten.',
      'Die Detektive erhalten je eine Spielfigur, je 10 Taxi-Tickets, je 8 Bus-Tickets und je 4 U-Bahn-Tickets.',
      'Treten nur 2 Spieler gegen „Mister X" an, so spielt jeder von ihnen 2 Detektive. Jeder erhält also 2 Spielfiguren und die doppelte Menge von Tickets. Entsprechend erhält dann „Mister X" insgesamt 4 Black Tickets.',
      'Die Startkarten werden verdeckt gemischt, und jeder zieht eine Karte. Die übrigen Karten bleiben verdeckt und werden beiseitegelegt. Die Nummer auf der Karte gibt die Nummer des Startpunkts auf dem Spielplan an. Die Detektive stellen ihre Spielfiguren auf ihre Startpunkte und geben ihre Startkarten wieder ab (in die Schachtel). „Mister X" stellt seine Figur natürlich nicht auf, da sein Startpunkt geheim bleibt. Er hebt seine Startkarte verdeckt auf.'
    ]
  },
  {
    title: 'Spielregel – Wie man zieht',
    paragraphs: [
      'Jeder Zug ist eine Fahrt mit dem Bus, der U-Bahn oder mit den bekannten Londoner Taxis. Man muß dafür ein entsprechendes Ticket abgeben. Die auf dem Plan eingezeichneten Verkehrsverbindungen entsprechen farblich den Tickets. Jeder Punkt ist Haltestelle für eines oder mehrere Verkehrsmittel. Farbsignale geben an, welche Verkehrsmittel dort halten: Bus = grüne Linie, grünes Farbsignal; U-Bahn = rote gestrichelte Linie, rotes Farbsignal; Taxi = gelbe Linie, gelbes Farbsignal.',
      'Ein Zug führt immer nur bis zur nächsten Haltestelle des gewählten Verkehrsmittels, entlang der entsprechenden Linie. Beispiele: Eine U-Bahn-Fahrt von Punkt 74 (links oberhalb von Kensington Gardens) führt entlang der roten gestrichelten Linie zu Punkt 46. Ein „Aussteigen" unterwegs ist nicht möglich. Eine Taxi-Fahrt von Punkt 74 führt zu Punkt 92 oder 73 oder 58 oder 75. Eine Bus-Fahrt führt zu Punkt 58 oder 94.',
      'Gelb ist bei allen Punkten vertreten, denn Taxi-Fahrten sind von allen Punkten aus möglich. Punkte mit zwei oder drei Farben erlauben es, beim nächsten Zug in ein anderes Verkehrsmittel umzusteigen.',
      'Auf einem Punkt dürfen nie zwei Spielfiguren stehen. Abgesehen davon können die Spieler ihre Fahrtrichtung beliebig wählen, soweit es die eingezeichneten Verkehrsverbindungen erlauben. Sie können auch beim nächsten Zug dieselbe Strecke wieder zurückfahren (wenn sie noch ein entsprechendes Ticket haben).',
      '„Mister X" macht immer den ersten Zug. Sein Zug geschieht, den Detektiven unbekannt, nur als verdeckte Eintragung auf der Fahrtentafel. Er schreibt die Nummer des Punktes, auf den er „zieht", in das erste Fenster.',
      'Seine Eintragung deckt er mit dem Ticket, das er für diesen Zug verbraucht hat, zu. Mit dem Ticket gibt er den Detektiven bekannt, welches Verkehrsmittel er benützt hat. (Den Startort braucht er nicht einzutragen; den Nachweis dafür hat er in Form seiner Startkarte.)',
      'Nach „Mister X" kommen die Detektive im Uhrzeigersinn an die Reihe. Jeder gibt ein Ticket aus seinem Vorrat an „Mister X" ab und versetzt seine Spielfigur auf dem Spielplan zur nächsten Haltestelle des gewählten Verkehrsmittels.',
      'Spielt ein Spieler mit 2 Detektiven, so muß er den Ticket-Vorrat für beide Detektive getrennt halten. Er zieht die Figuren nacheinander und gibt für jeden Zug ein Ticket aus dem entsprechenden Vorrat ab.'
    ]
  },
  {
    title: 'Der Ticket-Vorrat',
    paragraphs: [
      'Die Detektive haben für jedes Verkehrsmittel nur eine begrenzte Zahl von Tickets und können ein Verkehrsmittel nicht mehr verwenden, wenn sie dafür kein Ticket mehr haben.',
      'Der Ticket-Vorrat der Detektive sollte immer so auf dem Tisch liegen, daß „Mr. X" sehen kann, welche Verkehrsmittel die Detektive noch benützen können.',
      '„Mister X" dagegen stehen unbegrenzt Tickets zur Verfügung. Was er zu Beginn erhält, ist für die ersten Züge gemeint. Im weiteren Verlauf des Spiels verwendet er die Tickets, die die Detektive abgegeben haben. „Mister X" kann deshalb immer frei wählen, welches Verkehrsmittel er benützt. Einzige, wichtige Ausnahme: Ihm stehen nur so viele Black Tickets zur Verfügung, wie Detektive am Spiel teilnehmen.'
    ]
  },
  {
    title: 'Spezielle Züge von „Mister X" – Auftauchen',
    paragraphs: [
      '„Mister X" muß sich in regelmäßigen Abständen zeigen, zum ersten Mal nach seinem dritten Zug, dann nach Zug 8, 13, 18 und am Ende. Diese Auftauch-Stationen sind auf der Fahrtentafel durch ein größeres Fenster gekennzeichnet.',
      '„Mister X" macht wie sonst seine Eintragung auf der Fahrtentafel und legt sein Ticket darüber. Dann stellt er seine Figur tatsächlich an dem Ort auf, an dem er angekommen ist. Er läßt sie dort bis zu seinem nächsten Zug stehen. Bei seinem nächsten Zug wird er wieder unsichtbar – er nimmt die Figur weg.'
    ]
  },
  {
    title: 'Doppelzug',
    paragraphs: [
      'Die beiden Doppelzugkarten berechtigen „Mister X", zweimal im gesamten Spielverlauf einen Doppelzug auszuführen. Er zieht in diesem Fall mit einer beliebigen Kombination von Verkehrsmitteln zwei Punkte weiter. Er notiert beide Punkte (zwei Fenster!) und legt zwei Tickets ab. Zur Kontrolle gibt er eine Doppelzugkarte an seinen linken Nachbarn ab.',
      'Führt der erste Zug auf eine Auftauch-Station, so muß er sich dort zeigen. Mit dem zweiten Zug verschwindet er aber gleich wieder.'
    ]
  },
  {
    title: 'Black Tickets',
    paragraphs: [
      '„Mister X" darf seine Black Tickets jederzeit anstelle der normalen Tickets abgeben und darf damit jedes Verkehrsmittel einsetzen (auch bei einem Doppelzug!). Das Black Ticket, das „schwarze" Ticket, steht für jedes Verkehrsmittel – für die Detektive immer ein schwarzer Tag. Denn sie erhalten in diesem Fall keinen Hinweis, welches Verkehrsmittel „Mister X" verwendet hat.',
      'Noch schlimmer ist, daß „Mister X" – und nur er – mit einem Black Ticket auch ein Boot auf der Themse verwenden kann (von Punkt 194 nach 157, von 157 nach 115, von 115 nach 118 – oder umgekehrt).'
    ]
  },
  {
    title: 'Ende des Spiels',
    paragraphs: [
      'Das Spiel ist beendet, wenn ein Detektiv mit seiner Figur auf den Punkt kommt, an dem sich zu diesem Zeitpunkt „Mister X" befindet. Er muß sich in diesem Falle zeigen. „Mister X" hat damit das Spiel verloren.',
      'Das Spiel ist ebenfalls beendet, wenn die Detektive nicht mehr ziehen können. Damit hat „Mister X" gewonnen.',
      'Dieser Fall tritt spätestens mit dem 22. Zug ein, kann aber auch früher geschehen. Wenn nämlich Detektive nur noch Tickets übrig haben, die sie nicht mehr einsetzen können (Bus, U-Bahn), müssen sie am zuletzt erreichten Punkt stehenbleiben.',
      'In Zweifelsfällen können die Züge des „Mister X" Schritt für Schritt anhand der von ihm geführten Fahrtentafel unter den in der Reihenfolge abgelegten Tickets zurückverfolgt werden.',
      'Die Detektive können sich ihre eigenen Züge zur Kontrolle ebenfalls notieren.'
    ]
  },
  {
    title: 'Taktische Hinweise',
    paragraphs: [
      'Die Detektive werden sich möglichst so verteilen, daß sie „Mister X" einkreisen können. Absprachen unter den Detektiven sind erlaubt.',
      'Besonders wichtig für beide Parteien sind die Auftauch-Stationen. „Mister X" muß darauf achten, daß keiner der Detektive den Punkt, an dem er auftauchen muß, in derselben Runde erreichen kann. Der Punkt sollte natürlich auch möglichst viele Verbindungen haben, die es erlauben, den Detektiven wieder zu entwischen. Hier ist zur Verschleierung seines Fluchtweges der Einsatz von Black Tickets besonders wirkungsvoll, vielleicht sogar kombiniert mit einem Doppelzug.',
      'Die Detektive können (vor allem zu Beginn des Spiels) darauf achten, zum Zeitpunkt des Auftauchens von „Mister X" auf Punkten zu stehen, die einen möglichst schnellen Ortswechsel ermöglichen. In der Regel sind das die U-Bahn-Stationen.',
      'Vor allem für „Mister X" gilt es, den Spielplan sehr genau zu studieren. Es gibt eine Reihe von Stellen, an denen man bei flüchtiger Betrachtung Verkehrsverbindungen vermutet, die tatsächlich nicht vorhanden sind. Es gibt auch einige U-Bahn-Verbindungen, mit denen einem die Detektive sehr plötzlich auf den Leib rücken können.',
      'Die Spieler können (vor Spielbeginn!) auch folgende Regeländerung vereinbaren: „Mister X" kann sich, wenn er sich besonders sicher fühlt, zusätzlich freiwillig zeigen. Dafür darf er jedem Detektiv ein Ticket seiner Wahl wegnehmen. Damit schränkt er die Bewegungsfähigkeit der Detektive ein.'
    ]
  }
];

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss'
})
export class SetupComponent {
  @Output() startGame = new EventEmitter<NewGameConfig>();

  variant: BoardVariant = 'klassisch';
  detectiveCount = 4;
  misterXStart = 1;
  humanRole: HumanRole = 'misterX';

  /** Entwicklungsmodus: Mister X immer sichtbar, zu Kontrollzwecken beim Testen der KI.
   *  Checkbox bewusst separat vom eigentlichen Regelwerk gehalten – vor "echten" Partien
   *  einfach deaktivieren bzw. dieses Feld später ganz entfernen. */
  alwaysRevealMisterX = true;

  /** Editierbare Startpositionen – Standard: zufällig, aber vor Spielstart frei anpassbar
   *  (z. B. anhand der physischen Startkarten aus der Originalspielschachtel). */
  slots: { color: DetectiveColor; startStation: number }[] = [];

  readonly maxStation = 199;

  /** Steuert die einklappbare Spielanleitung (siehe RULEBOOK_SECTIONS oben). */
  rulebookOpen = false;

  constructor() {
    this.regenerateSlots();
  }

  get rulebookSections(): RulebookSection[] {
    return RULEBOOK_SECTIONS;
  }

  toggleRulebook(): void {
    this.rulebookOpen = !this.rulebookOpen;
  }

  get availableColors(): DetectiveColor[] {
    return ALL_COLORS;
  }

  onDetectiveCountChange(): void {
    this.regenerateSlots();
  }

  regenerateSlots(): void {
    const stations = this.pickDistinctRandomStations(this.detectiveCount + 1);
    this.misterXStart = stations[0];
    this.slots = ALL_COLORS.slice(0, this.detectiveCount).map((color, i) => ({
      color,
      startStation: stations[i + 1]
    }));
  }

  private pickDistinctRandomStations(count: number): number[] {
    const chosen = new Set<number>();
    while (chosen.size < count) {
      chosen.add(1 + Math.floor(Math.random() * this.maxStation));
    }
    return Array.from(chosen);
  }

  submit(): void {
    this.startGame.emit({
      variant: this.variant,
      detectiveSetup: this.slots,
      misterXStart: this.misterXStart,
      humanRole: this.humanRole,
      alwaysRevealMisterX: this.alwaysRevealMisterX
    });
  }
}

