import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { MainLayoutComponent } from './components/main-layout/main-layout.component';
import { ChatComponent } from './components/chat/chat.component';
import { FriendsComponent } from './components/friends/friends.component';
import { ProfileComponent } from './components/profile/profile.component';
import { authGuard } from './guards/auth-guard';
// import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  { path: 'login', component: LoginComponent },

  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],        //  ⬅️ Protected by guard
    children: [
      { path: 'chat', component: ChatComponent },
      { path: 'friends', component: FriendsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'profile/:userId', component: ProfileComponent }
    ]
  }
];
