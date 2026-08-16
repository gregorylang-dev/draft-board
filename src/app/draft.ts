import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { ref, onValue, set } from 'firebase/database';
import { db } from './firebase.config';
import { Player, getDefaultPlayers } from './nfl-players';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

export type { Player };

export interface DraftPick {
  pickNumber: number;
  player: Player;
  teamName: string;
  timestamp: Date;
}

export const DEFAULT_TEAMS = [
  'Team 1', 'Team 2', 'Team 3', 'Team 4', 
  'Team 5', 'Team 6', 'Team 7', 'Team 8', 
  'Team 9', 'Team 10'
];

@Injectable({
  providedIn: 'root'
})
export class DraftService {
  private STORAGE_KEY = 'draft_master_state';
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private router = inject(Router);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  private players = signal<Player[]>(this.loadInitialPlayers());
  private teams = signal<string[]>(this.loadInitialTeams());

  private draftLog = signal<DraftPick[]>(this.loadInitialLog());
  private currentPickIndex = signal(this.loadInitialIndex());
  private readonly PICK_DURATION_SECONDS = 180; // 3 minutes
  // Anchor timestamp (ms) the current pick's countdown is measured from. Shared via
  // Firebase so every client derives the same remaining time instead of drifting.
  private pickStartedAt = signal<number>(this.loadInitialPickStartedAt());
  // Offset between this client's clock and the Firebase server's clock, so timer math
  // stays correct even if clients' system clocks disagree.
  private serverTimeOffsetMs = signal<number>(0);
  private timeRemaining = signal(180); // 3 minutes in seconds
  private timerInterval: ReturnType<typeof setInterval> | undefined;

  pulsingPickNumber = signal<number | null>(null);
  isSynced = signal<boolean>(false);
  autoFlipEnabled = signal<boolean>(this.loadAutoFlipSetting());
  private pulseTimeout: ReturnType<typeof setTimeout> | undefined;
  private isApplyingRemoteUpdate = false;

  private lastConfirmedLog: DraftPick[] = [];
  private lastConfirmedIndex: number = 0;

  constructor() {
    this.startTimer();
    this.initFirebaseSync();
    this.initServerTimeOffset();
  }

  private loadAutoFlipSetting(): boolean {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('draft_auto_flip');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  }

  toggleAutoFlip() {
    this.autoFlipEnabled.update(v => !v);
    if (this.isBrowser) {
      localStorage.setItem('draft_auto_flip', String(this.autoFlipEnabled()));
    }
  }

  private initFirebaseSync() {
    if (!this.isBrowser) return;
    try {
      const sessionRef = ref(db, 'draft_session');
      onValue(sessionRef, (snapshot) => {
        if (snapshot.exists()) {
          this.isSynced.set(true);
          const data = snapshot.val();
          const remoteLog = ((data['draftLog'] as any[]) || []).map((pick: any) => ({
            ...pick,
            timestamp: new Date(pick.timestamp)
          }));
          const remoteIndex = typeof data['currentPickIndex'] === 'number' ? data['currentPickIndex'] : 0;
          const remotePulse = typeof data['pulsingPickNumber'] === 'number' ? data['pulsingPickNumber'] : null;
          const remoteTeams = Array.isArray(data['teams']) && data['teams'].length > 0 ? data['teams'] : [...DEFAULT_TEAMS];
          const remotePickStartedAt = typeof data['pickStartedAt'] === 'number' ? data['pickStartedAt'] : Date.now();

          this.applyRemoteState(remoteLog, remoteIndex, remotePulse, remoteTeams, remotePickStartedAt);
        } else {
          this.isSynced.set(true);
        }
      }, (error) => {
        console.warn('Firebase Realtime Database sync connection issue:', error);
        this.isSynced.set(false);
      });
    } catch (e) {
      console.warn('Failed to initialize Firebase Sync:', e);
      this.isSynced.set(false);
    }
  }

  // Tracks the offset between this client's clock and the Firebase server's clock.
  // Firebase pushes updates to this special path whenever the offset changes, so the
  // timer self-corrects for clock skew without any polling.
  private initServerTimeOffset() {
    if (!this.isBrowser) return;
    try {
      const offsetRef = ref(db, '.info/serverTimeOffset');
      onValue(offsetRef, (snapshot) => {
        this.serverTimeOffsetMs.set(typeof snapshot.val() === 'number' ? snapshot.val() : 0);
        this.recomputeTimeRemaining();
      });
    } catch (e) {
      console.warn('Failed to read Firebase server time offset:', e);
    }
  }

  private applyRemoteState(remoteLog: DraftPick[], remoteIndex: number, remotePulse: number | null, remoteTeams?: string[], remotePickStartedAt?: number) {
    this.isApplyingRemoteUpdate = true;
    this.lastConfirmedLog = remoteLog;
    this.lastConfirmedIndex = remoteIndex;

    if (remoteTeams && Array.isArray(remoteTeams)) {
      this.teams.set(remoteTeams);
    }

    if (typeof remotePickStartedAt === 'number') {
      this.pickStartedAt.set(remotePickStartedAt);
      this.recomputeTimeRemaining();
    }

    // Reconstruct player state from remote log
    const defaultPlayers: Player[] = getDefaultPlayers();
    remoteLog.forEach((pick: DraftPick) => {
      const p = defaultPlayers.find(player => player.id === pick.player.id);
      if (p) {
        p.isDrafted = true;
        p.draftedBy = pick.teamName;
        p.draftPick = pick.pickNumber;
      }
    });

    this.players.set(defaultPlayers);
    this.draftLog.set(remoteLog);
    this.currentPickIndex.set(remoteIndex);

    if (remotePulse !== null && remotePulse !== this.pulsingPickNumber()) {
      this.pulsingPickNumber.set(remotePulse);
      if (this.pulseTimeout) clearTimeout(this.pulseTimeout);
      this.pulseTimeout = setTimeout(() => {
        this.pulsingPickNumber.set(null);
      }, 10000);
    }

    this.saveToLocalStorage();
    this.isApplyingRemoteUpdate = false;
  }

  private pushToFirebase(pulsingPickNumber: number | null = null) {
    if (!this.isBrowser || this.isApplyingRemoteUpdate) return;
    try {
      const sessionRef = ref(db, 'draft_session');
      const serializableLog = this.draftLog().map(pick => ({
        ...pick,
        timestamp: pick.timestamp instanceof Date ? pick.timestamp.toISOString() : pick.timestamp
      }));

      set(sessionRef, {
        draftLog: serializableLog,
        currentPickIndex: this.currentPickIndex(),
        pulsingPickNumber: pulsingPickNumber,
        teams: this.teams(),
        pickStartedAt: this.pickStartedAt(),
        lastUpdated: new Date().toISOString()
      }).catch(err => {
        console.warn('Error saving to Firebase Realtime Database:', err);
        this.toastService.show('You do not have permission to draft players.', 'error');
        // Revert to last confirmed remote state
        this.applyRemoteState(this.lastConfirmedLog, this.lastConfirmedIndex, null);
      });
    } catch (err) {
      console.warn('Firebase push failed:', err);
      this.toastService.show('You do not have permission to draft players.', 'error');
    }
  }

  private startTimer() {
    if (!this.isBrowser) return;
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.recomputeTimeRemaining();
    this.timerInterval = setInterval(() => {
      this.recomputeTimeRemaining();
    }, 1000);
  }

  // Derives the remaining time from the shared pickStartedAt anchor instead of
  // decrementing a local counter, so every client (and every tab) always agrees on
  // the same value the instant pickStartedAt syncs via Firebase, with no drift.
  private recomputeTimeRemaining() {
    const serverNow = Date.now() + this.serverTimeOffsetMs();
    const elapsedSeconds = Math.floor((serverNow - this.pickStartedAt()) / 1000);
    const nextTime = Math.max(0, this.PICK_DURATION_SECONDS - elapsedSeconds);
    const prevTime = this.timeRemaining();

    this.timeRemaining.set(nextTime);

    if (prevTime > 60 && nextTime <= 60 && this.autoFlipEnabled()) {
      this.router.navigate(['/draft-room']);
    }
  }

  private resetTimer() {
    this.pickStartedAt.set(Date.now() + this.serverTimeOffsetMs());
    this.recomputeTimeRemaining();
  }

  manualResetTimer() {
    this.resetTimer();
    this.saveToLocalStorage();
    this.pushToFirebase(this.pulsingPickNumber());
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

  private loadInitialTeams(): string[] {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (Array.isArray(data.teams) && data.teams.length === DEFAULT_TEAMS.length) {
            return data.teams;
          }
        } catch (error) {
          console.error('Error loading initial teams', error);
        }
      }
    }
    return [...DEFAULT_TEAMS];
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

  private loadInitialPickStartedAt(): number {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (typeof data.pickStartedAt === 'number') return data.pickStartedAt;
        } catch (error) {
          console.error('Error loading initial pick start time', error);
        }
      }
    }
    return Date.now();
  }

  private saveToLocalStorage() {
    if (this.isBrowser && typeof window !== 'undefined' && window.localStorage) {
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
    if (!this.authService.currentUser()) {
      this.toastService.show('You do not have permission to draft players.', 'error');
      return;
    }

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

    // Pulse new pick for 10 seconds and return to big board
    this.pulsingPickNumber.set(pickNumber);
    if (this.pulseTimeout) clearTimeout(this.pulseTimeout);
    this.pulseTimeout = setTimeout(() => {
      this.pulsingPickNumber.set(null);
    }, 10000);

    this.pushToFirebase(pickNumber);
    if (this.autoFlipEnabled()) {
      this.router.navigate(['/']);
    }
  }

  undoLastPick() {
    if (!this.authService.currentUser()) {
      this.toastService.show('You do not have permission to undo draft picks.', 'error');
      return;
    }

    const currentLog = this.draftLog();
    if (currentLog.length === 0) return;

    const lastPick = currentLog[currentLog.length - 1];

    // Remove last pick from log
    this.draftLog.update(log => log.slice(0, log.length - 1));

    // Reset player drafted status
    this.players.update(players => players.map(p => 
      p.id === lastPick.player.id ? { ...p, isDrafted: false, draftedBy: undefined, draftPick: undefined } : p
    ));

    // Decrement current pick index
    this.currentPickIndex.update(i => Math.max(0, i - 1));

    // Reset pulsing pick if matching
    if (this.pulsingPickNumber() === lastPick.pickNumber) {
      this.pulsingPickNumber.set(null);
    }

    this.resetTimer();
    this.saveToLocalStorage();
    this.pushToFirebase(null);
  }

  getRoster(teamName: string) {
    return computed(() => this.players().filter(p => p.draftedBy === teamName));
  }

  updateTeamName(index: number, newName: string) {
    const trimmed = newName.trim();
    const validName = trimmed.length > 0 ? trimmed : DEFAULT_TEAMS[index] || `Team ${index + 1}`;
    const currentTeams = [...this.teams()];
    if (index < 0 || index >= currentTeams.length) return;
    const oldName = currentTeams[index];
    if (oldName === validName) return;

    currentTeams[index] = validName;
    this.teams.set(currentTeams);

    // Update existing picks in log & players if team was renamed
    this.draftLog.update(log => log.map(pick => 
      pick.teamName === oldName ? { ...pick, teamName: validName } : pick
    ));

    this.players.update(players => players.map(p => 
      p.draftedBy === oldName ? { ...p, draftedBy: validName } : p
    ));

    this.saveToLocalStorage();
    this.pushToFirebase(this.pulsingPickNumber());
  }

  resetDraft() {
    this.teams.set([...DEFAULT_TEAMS]);
    this.players.update(players => players.map(p => ({ ...p, isDrafted: false, draftedBy: undefined, draftPick: undefined })));
    this.draftLog.set([]);
    this.currentPickIndex.set(0);
    this.pulsingPickNumber.set(null);
    if (this.pulseTimeout) clearTimeout(this.pulseTimeout);
    this.resetTimer();
    this.saveToLocalStorage();
    this.pushToFirebase(null);
  }

  exportToJSON(): string {
    const data = {
      draftLog: this.draftLog(),
      currentPickIndex: this.currentPickIndex(),
      teams: this.teams(),
      pickStartedAt: this.pickStartedAt()
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

      // Restore log & teams
      const log = (data.draftLog as DraftPick[]).map((pick: DraftPick) => ({
        ...pick,
        timestamp: new Date(pick.timestamp)
      }));
      this.draftLog.set(log);
      this.currentPickIndex.set(data.currentPickIndex);
      if (Array.isArray(data.teams) && data.teams.length === DEFAULT_TEAMS.length) {
        this.teams.set(data.teams);
      } else {
        this.teams.set([...DEFAULT_TEAMS]);
      }

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
      this.pushToFirebase(null);
    } catch (e) {
      console.error('Failed to import draft:', e);
      alert('Failed to import draft file. Please ensure it is a valid DraftMaster save file.');
    }
  }
}
