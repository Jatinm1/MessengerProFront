import { Routes } from '@angular/router';
import { AuthComponent } from './components/auth/auth.component';
import { MainLayoutComponent } from './components/main-layout/main-layout.component';
import { ChatComponent } from './components/chat/chat.component';
import { FriendsComponent } from './components/friends/friends.component';
import { ProfileComponent } from './components/profile/profile.component';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [

  { path: '', redirectTo: '/auth', pathMatch: 'full' },

  // 🔐 Auth Page (Login + Signup)
  { path: 'auth', component: AuthComponent },

  // 🔒 Protected Area
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: 'chat', component: ChatComponent },
      { path: 'friends', component: FriendsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'profile/:userId', component: ProfileComponent }
    ]
  }

];