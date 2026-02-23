import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DraftService, Player } from './draft';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-home',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './home.html',
})
export class Home {
  private draftService = inject(DraftService);

  searchQuery = signal('');
  selectedTeam = signal('Team 1');

  availablePlayers = this.draftService.availablePlayers;
  allTeams = this.draftService.allTeams;
  draftLog = this.draftService.log;
  currentPickNumber = this.draftService.currentPickNumber;
  currentTeamDrafting = this.draftService.currentTeamDrafting;
  timerDisplay = this.draftService.timerDisplay;
  isTimeLow = this.draftService.isTimeLow;

  filteredPlayers = computed(() => {
    const query = this.searchQuery().toLowerCase();
    return this.availablePlayers().filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.position.toLowerCase().includes(query) || 
      p.team.toLowerCase().includes(query)
    );
  });

  selectedTeamRoster = computed(() => {
    return this.draftService.getRoster(this.selectedTeam())();
  });

  onDraft(player: Player) {
    this.draftService.draftPlayer(player.id);
    this.searchQuery.set('');
  }

  selectTeam(team: string) {
    this.selectedTeam.set(team);
  }

  getTeamColor(team: string) {
    return this.draftService.getTeamColor(team);
  }
}
