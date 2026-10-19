import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage)
  },
  {
    path: 'galeria',
    loadComponent: () => import('./gallery/gallery.page').then((m) => m.GalleryPage)
  },
  {
    path: 'storage-gallery',
    loadComponent: () => import('./gallery/gallery.page').then((m) => m.GalleryPage)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
