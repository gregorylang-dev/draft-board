import { ChangeDetectionStrategy, Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { DraftService, Player } from './draft';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-grid',
  imports: [CommonModule, MatIconModule, FormsModule],
  templateUrl: './grid.html',
})
export class Grid {
  private draftService = inject(DraftService);

  allTeams = this.draftService.allTeams;
  currentPickNumber = this.draftService.currentPickNumber;
  currentTeamDrafting = this.draftService.currentTeamDrafting;
  timerDisplay = this.draftService.timerDisplay;
  isTimeLow = this.draftService.isTimeLow;
  pulsingPickNumber = this.draftService.pulsingPickNumber;
  
  editingIndex = signal<number | null>(null);
  editingValue = signal<string>('');

  startEditing(index: number, currentName: string) {
    this.editingIndex.set(index);
    this.editingValue.set(currentName);
  }

  saveTeamName(index: number) {
    if (this.editingIndex() === index) {
      this.draftService.updateTeamName(index, this.editingValue());
      this.editingIndex.set(null);
    }
  }

  cancelEditing() {
    this.editingIndex.set(null);
  }
  
  // Create a structure: { teamName: Player[] }
  teamPicks = computed(() => {
    const teams = this.allTeams();
    const picksMap: Record<string, Player[]> = {};
    
    teams.forEach(team => {
      picksMap[team] = this.draftService.getRoster(team)();
    });
    
    return picksMap;
  });

  // Determine max picks to set row count
  maxPicks = computed(() => {
    const picks = this.teamPicks();
    let max = 0;
    Object.values(picks).forEach(p => {
      if (p.length > max) max = p.length;
    });
    return max > 0 ? max : 15; // Default to 15 rounds if empty
  });

  rounds = computed(() => Array.from({ length: this.maxPicks() }, (_, i) => i + 1));

  onResetTimer() {
    this.draftService.manualResetTimer();
  }

  getTeamColor(team: string) {
    return this.draftService.getTeamColor(team);
  }
}
