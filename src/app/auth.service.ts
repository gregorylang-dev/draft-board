import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { User, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.config';

export type { User };

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  currentUser = signal<User | null>(null);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);

  constructor() {
    this.initAuthListener();
  }

  private initAuthListener() {
    if (!this.isBrowser) {
      this.isLoading.set(false);
      return;
    }

    try {
      onAuthStateChanged(auth, (user) => {
        this.currentUser.set(user);
        this.isLoading.set(false);
      }, (err) => {
        console.warn('Auth state change error:', err);
        this.isLoading.set(false);
      });
    } catch (err) {
      console.warn('Firebase Auth initialization error:', err);
      this.isLoading.set(false);
    }
  }

  async signInWithGoogle() {
    if (!this.isBrowser) return;
    this.error.set(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      this.currentUser.set(result.user);
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      this.error.set(err.message || 'Failed to sign in with Google.');
    }
  }

  async logout() {
    if (!this.isBrowser) return;
    this.error.set(null);
    try {
      await signOut(auth);
      this.currentUser.set(null);
    } catch (err: any) {
      console.error('Sign-Out error:', err);
      this.error.set(err.message || 'Failed to sign out.');
    }
  }
}
