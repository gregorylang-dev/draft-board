import { Routes } from '@angular/router';
import { Home } from './home';
import { Grid } from './grid';

export const routes: Routes = [
  { path: '', component: Grid },
  { path: 'draft-room', component: Home },
  { path: 'grid', redirectTo: '' },
  { path: '**', redirectTo: '' }
];
