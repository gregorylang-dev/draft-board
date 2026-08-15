import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Player, getDefaultPlayers } from './nfl-players';

export type { Player };

export interface DraftPick {
  pickNumber: number;
  player: Player;
  teamName: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class DraftService {
  private STORAGE_KEY = 'draft_master_state';
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private players = signal<Player[]>(this.loadInitialPlayers());
  private teams = signal<string[]>([
    'Team 1', 'Team 2', 'Team 3', 'Team 4', 
    'Team 5', 'Team 6', 'Team 7', 'Team 8', 
    'Team 9', 'Team 10', 'Team 11', 'Team 12'
  ]);

  private draftLog = signal<DraftPick[]>(this.loadInitialLog());
  private currentPickIndex = signal(this.loadInitialIndex());
  private timeRemaining = signal(180); // 3 minutes in seconds
  private timerInterval: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.startTimer();
  }

  private startTimer() {
    if (!this.isBrowser) return;
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      if (this.timeRemaining() > 0) {
        this.timeRemaining.update(time => time - 1);
      }
    }, 1000);
  }

  private resetTimer() {
    this.timeRemaining.set(180);
  }

  manualResetTimer() {
    this.resetTimer();
  }

  private loadInitialPlayers(): Player[] {
    const defaultPlayers: Player[] = getDefaultPlayers();

    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          const log = (data.draftLog as DraftPick[]) || [];
          // Reconstruct player status from log
          log.forEach((pick: DraftPick) => {
            const p = defaultPlayers.find(player => player.id === pick.player.id);
            if (p) {
              p.isDrafted = true;
              p.draftedBy = pick.teamName;
              p.draftPick = pick.pickNumber;
            }
          });
        } catch (error) {
          console.error('Error parsing saved state', error);
        }
      }
    }
    return defaultPlayers;
  }

  private loadInitialLog(): DraftPick[] {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          return ((data.draftLog as DraftPick[]) || []).map((p: DraftPick) => ({ ...p, timestamp: new Date(p.timestamp) }));
        } catch (error) {
          console.error('Error loading initial log', error);
        }
      }
    }
    return [];
  }

  private loadInitialIndex(): number {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          return typeof data.currentPickIndex === 'number' ? data.currentPickIndex : 0;
        } catch (error) {
          console.error('Error loading initial index', error);
        }
      }
    }
    return 0;
  }

  private saveToLocalStorage() {
    if (this.isBrowser) {
      localStorage.setItem(this.STORAGE_KEY, this.exportToJSON());
    }
  }

  getTeamColor(team: string): string {
    const colors: Record<string, string> = {
      'ARI': 'bg-red-700/10 border-red-700/20',
      'ATL': 'bg-red-600/10 border-red-600/20',
      'BAL': 'bg-indigo-600/10 border-indigo-600/20',
      'BUF': 'bg-blue-700/10 border-blue-700/20',
      'CAR': 'bg-sky-500/10 border-sky-500/20',
      'CHI': 'bg-blue-950/10 border-blue-950/20',
      'CIN': 'bg-orange-500/10 border-orange-500/20',
      'CLE': 'bg-orange-900/10 border-orange-900/20',
      'DAL': 'bg-blue-400/10 border-blue-400/20',
      'DEN': 'bg-orange-600/10 border-orange-600/20',
      'DET': 'bg-cyan-400/10 border-cyan-400/20',
      'GB': 'bg-green-700/10 border-green-700/20',
      'HOU': 'bg-blue-900/10 border-blue-900/20',
      'IND': 'bg-blue-600/10 border-blue-600/20',
      'JAX': 'bg-teal-600/10 border-teal-600/20',
      'KC': 'bg-red-500/10 border-red-500/20',
      'LV': 'bg-zinc-400/10 border-zinc-400/20',
      'LAC': 'bg-sky-400/10 border-sky-400/20',
      'LAR': 'bg-blue-400/10 border-blue-400/20',
      'MIA': 'bg-teal-400/10 border-teal-400/20',
      'MIN': 'bg-purple-500/10 border-purple-500/20',
      'NE': 'bg-blue-900/10 border-blue-900/20',
      'NO': 'bg-yellow-600/10 border-yellow-600/20',
      'NYG': 'bg-blue-800/10 border-blue-800/20',
      'NYJ': 'bg-emerald-500/10 border-emerald-500/20',
      'PHI': 'bg-emerald-800/10 border-emerald-800/20',
      'PIT': 'bg-yellow-500/10 border-yellow-500/20',
      'SEA': 'bg-blue-500/10 border-blue-500/20',
      'SF': 'bg-red-500/10 border-red-500/20',
      'TB': 'bg-red-800/10 border-red-800/20',
      'TEN': 'bg-blue-600/10 border-blue-600/20',
      'WAS': 'bg-red-900/10 border-red-900/20',
    };
    return colors[team] || 'bg-zinc-950/50 border-zinc-800';
  }

  availablePlayers = computed(() => this.players().filter(p => !p.isDrafted));
  allTeams = computed(() => this.teams());
  log = computed(() => this.draftLog());
  timerDisplay = computed(() => {
    const totalSeconds = this.timeRemaining();
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });
  isTimeLow = computed(() => this.timeRemaining() < 30);
  
  currentPickNumber = computed(() => this.currentPickIndex() + 1);
  currentTeamDrafting = computed(() => {
    const teams = this.teams();
    const index = this.currentPickIndex();
    const round = Math.floor(index / teams.length);
    const posInRound = index % teams.length;
    
    // Snake draft logic
    if (round % 2 === 0) {
      return teams[posInRound];
    } else {
      return teams[teams.length - 1 - posInRound];
    }
  });

  draftPlayer(playerId: string) {
    const player = this.players().find(p => p.id === playerId);
    if (!player || player.isDrafted) return;

    const teamName = this.currentTeamDrafting();
    const pickNumber = this.currentPickNumber();

    this.players.update(players => players.map(p => 
      p.id === playerId ? { ...p, isDrafted: true, draftedBy: teamName, draftPick: pickNumber } : p
    ));

    this.draftLog.update(log => [...log, {
      pickNumber,
      player: { ...player, isDrafted: true, draftedBy: teamName, draftPick: pickNumber },
      teamName,
      timestamp: new Date()
    }]);

    this.currentPickIndex.update(i => i + 1);
    this.resetTimer();
    this.saveToLocalStorage();
  }

  getRoster(teamName: string) {
    return computed(() => this.players().filter(p => p.draftedBy === teamName));
  }

  resetDraft() {
    this.players.update(players => players.map(p => ({ ...p, isDrafted: false, draftedBy: undefined, draftPick: undefined })));
    this.draftLog.set([]);
    this.currentPickIndex.set(0);
    this.resetTimer();
    this.saveToLocalStorage();
  }

  exportToJSON(): string {
    const data = {
      draftLog: this.draftLog(),
      currentPickIndex: this.currentPickIndex()
    };
    return JSON.stringify(data, null, 2);
  }

  importFromJSON(json: string) {
    try {
      const data = JSON.parse(json);
      if (!data.draftLog || typeof data.currentPickIndex !== 'number') {
        throw new Error('Invalid draft data format');
      }

      // Reset first
      this.resetDraft();

      // Restore log
      const log = (data.draftLog as DraftPick[]).map((pick: DraftPick) => ({
        ...pick,
        timestamp: new Date(pick.timestamp)
      }));
      this.draftLog.set(log);
      this.currentPickIndex.set(data.currentPickIndex);

      // Update players state based on log
      this.players.update(players => {
        const newPlayers = [...players];
        log.forEach((pick: DraftPick) => {
          const playerIndex = newPlayers.findIndex(p => p.id === pick.player.id);
          if (playerIndex !== -1) {
            newPlayers[playerIndex] = {
              ...newPlayers[playerIndex],
              isDrafted: true,
              draftedBy: pick.teamName,
              draftPick: pick.pickNumber
            };
          }
        });
        return newPlayers;
      });
      this.resetTimer();
      this.saveToLocalStorage();
    } catch (e) {
      console.error('Failed to import draft:', e);
      alert('Failed to import draft file. Please ensure it is a valid DraftMaster save file.');
    }
  }
}
