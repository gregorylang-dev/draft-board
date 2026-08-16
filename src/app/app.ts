import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DraftService } from './draft';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
})
export class App {
  private draftService = inject(DraftService);
  authService = inject(AuthService);
  toastService = inject(ToastService);

  isSynced = this.draftService.isSynced;
  currentUser = this.authService.currentUser;
  toast = this.toastService.toast;

  autoFlipEnabled = this.draftService.autoFlipEnabled;
  isSettingsOpen = signal(false);

  toggleAutoFlip() {
    this.draftService.toggleAutoFlip();
  }

  toggleSettings() {
    this.isSettingsOpen.update(v => !v);
  }

  closeSettings() {
    this.isSettingsOpen.set(false);
  }

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
