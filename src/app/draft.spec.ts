import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DraftService, DEFAULT_TEAMS } from './draft';
import { runInInjectionContext, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

describe('DraftService - Team Names', () => {
  let service: DraftService;

  beforeEach(() => {
    const mockInjector = {
      get: (token: any) => {
        if (token === PLATFORM_ID) return 'browser';
        if (token === Router) return { navigate: vi.fn() };
        if (token === AuthService) return { currentUser: () => null };
        if (token === ToastService) return { show: vi.fn() };
        return null;
      }
    };

    runInInjectionContext(mockInjector as any, () => {
      service = new DraftService();
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.clear();
    }
    service.resetDraft();
  });

  it('should initialize with default team names', () => {
    expect(service.allTeams()).toEqual(DEFAULT_TEAMS);
  });

  it('should update team name at specified index', () => {
    service.updateTeamName(0, 'Fantasy Kings');
    expect(service.allTeams()[0]).toBe('Fantasy Kings');
    expect(service.allTeams()[1]).toBe('Team 2');
  });

  it('should reset team names to default on resetDraft', () => {
    service.updateTeamName(0, 'Fantasy Kings');
    service.updateTeamName(1, 'Touchdown Titans');
    expect(service.allTeams()[0]).toBe('Fantasy Kings');

    service.resetDraft();
    expect(service.allTeams()).toEqual(DEFAULT_TEAMS);
  });

  it('should fallback to default team name if empty string provided', () => {
    service.updateTeamName(0, '   ');
    expect(service.allTeams()[0]).toBe('Team 1');
  });

  it('should undo last pick when user is authenticated', () => {
    // Mock user logged in
    (service as any).authService = { currentUser: () => ({ uid: 'user123' }) };

    const firstPlayer = service.availablePlayers()[0];
    service.draftPlayer(firstPlayer.id);

    expect(service.log().length).toBe(1);
    expect(service.currentPickNumber()).toBe(2);
    expect(service.availablePlayers().find(p => p.id === firstPlayer.id)).toBeUndefined();

    service.undoLastPick();

    expect(service.log().length).toBe(0);
    expect(service.currentPickNumber()).toBe(1);
    expect(service.availablePlayers().find(p => p.id === firstPlayer.id)).toBeDefined();
  });

  it('should prevent undo pick when user is not authenticated', () => {
    (service as any).authService = { currentUser: () => ({ uid: 'user123' }) };
    const firstPlayer = service.availablePlayers()[0];
    service.draftPlayer(firstPlayer.id);

    // Logout
    (service as any).authService = { currentUser: () => null };

    service.undoLastPick();

    expect(service.log().length).toBe(1);
    expect(service.currentPickNumber()).toBe(2);
  });
});
