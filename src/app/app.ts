import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DraftService } from './draft';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
})
export class App {
  private draftService = inject(DraftService);

  onReset() {
    if (confirm('Are you sure you want to reset the entire draft?')) {
      this.draftService.resetDraft();
    }
  }
}
