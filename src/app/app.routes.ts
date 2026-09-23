import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./report-builder/report-builder').then(m => m.ReportBuilder) },
];
