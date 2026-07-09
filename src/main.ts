import { bootstrapApplication } from '@angular/platform-browser';
import { GameComponent } from './app/features/game/game.component';

bootstrapApplication(GameComponent).catch(err => console.error(err));
