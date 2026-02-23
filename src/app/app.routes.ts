import { Routes } from '@angular/router';
import { Home } from './home';
import { Grid } from './grid';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'grid', component: Grid },
  { path: '**', redirectTo: '' }
];
