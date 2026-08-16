import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DraftService } from './draft';
import { AuthService } from './auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
})
export class App {
  private draftService = inject(DraftService);
  authService = inject(AuthService);

  isSynced = this.draftService.isSynced;
  currentUser = this.authService.currentUser;

  onReset() {
    if (confirm('Are you sure you want to reset the entire draft?')) {
      this.draftService.resetDraft();
    }
  }

  onGoogleSignIn() {
    this.authService.signInWithGoogle();
  }

  onLogout() {
    this.authService.logout();
  }
}
