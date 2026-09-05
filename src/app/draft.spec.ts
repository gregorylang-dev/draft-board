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

  it('should return team roster ordered by draft pick number regardless of initial player ranking', () => {
    (service as any).authService = { currentUser: () => ({ uid: 'user123' }) };

    // Team 1 drafts player at index 10 (lower ADP rank) with Pick #1
    const lowerRankedPlayer = service.availablePlayers()[10];
    service.draftPlayer(lowerRankedPlayer.id);

    // Simulate picks 2 through 12 for other teams
    for (let i = 1; i < 12; i++) {
      service.draftPlayer(service.availablePlayers()[0].id);
    }

    // Simulate picks 13 through 23 in round 2 (snake draft returns to Team 1 at pick 24)
    for (let i = 0; i < 11; i++) {
      service.draftPlayer(service.availablePlayers()[0].id);
    }

    // Team 1 is on the clock for Pick #24 and drafts player at index 0 (top ADP rank)
    const topRankedPlayer = service.availablePlayers()[0];
    expect(service.currentTeamDrafting()).toBe('Team 1');
    expect(service.currentPickNumber()).toBe(24);
    service.draftPlayer(topRankedPlayer.id);

    const team1Roster = service.getRoster('Team 1')();
    expect(team1Roster.length).toBe(2);
    // Pick 1 (Round 1) should be first, Pick 24 (Round 2) should be second
    expect(team1Roster[0].id).toBe(lowerRankedPlayer.id);
    expect(team1Roster[0].draftPick).toBe(1);
    expect(team1Roster[1].id).toBe(topRankedPlayer.id);
    expect(team1Roster[1].draftPick).toBe(24);
  });
});
