import { Injectable, signal } from '@angular/core';

export interface ToastInfo {
  message: string;
  type: 'error' | 'info' | 'success';
  id: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toast = signal<ToastInfo | null>(null);
  private timeoutId: any;

  show(message: string, type: 'error' | 'info' | 'success' = 'error') {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.toast.set({ message, type, id: Date.now() });

    this.timeoutId = setTimeout(() => {
      this.toast.set(null);
    }, 4000);
  }

  dismiss() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.toast.set(null);
  }
}
