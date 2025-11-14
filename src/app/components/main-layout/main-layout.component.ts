import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { User } from '../../models/chat.models';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `
    <div class="main-layout" *ngIf="currentUser">
      <div class="mobile-header">
        <button class="menu-toggle" (click)="toggleMobileMenu()">☰</button>
        <div class="mobile-title">ChatApp</div>
        <div class="mobile-user">{{ currentUser.displayName }}</div>
      </div>

      <aside class="sidebar-nav" [class.mobile-open]="mobileMenuOpen">
        <div class="nav-header">
          <h2>ChatApp</h2>
          <div class="user-info" (click)="navigateTo('/profile')" style="cursor: pointer;">
            <div class="user-avatar">{{ getInitials(currentUser.displayName) }}</div>
            <div class="user-details">
              <div class="user-name">{{ currentUser.displayName }}</div>
              <div class="user-status">🟢 Online</div>
            </div>
          </div>
        </div>

        <nav class="nav-menu">
          <button 
            class="nav-item"
            [class.active]="isActive('/chat')"
            (click)="navigateTo('/chat')">
            💬 <span>Chats</span>
          </button>

          <button 
            class="nav-item"
            [class.active]="isActive('/friends')"
            (click)="navigateTo('/friends')">
            👥 <span>Friends</span>
          </button>

          <button 
            class="nav-item"
            [class.active]="isActive('/profile')"
            (click)="navigateTo('/profile')">
            👤 <span>Profile</span>
          </button>
        </nav>

        <div class="nav-footer">
          <button class="logout-btn" (click)="logout()">
            Logout
          </button>
        </div>
      </aside>

      <div class="main-content" (click)="closeMobileMenu()">
        <router-outlet></router-outlet>
      </div>

      <div class="mobile-overlay" 
           [class.active]="mobileMenuOpen"
           (click)="closeMobileMenu()"></div>
    </div>
  `,
  styles: [`
    .main-layout {
      display: flex;
      height: 100vh;
      background: #0f172a;
      position: relative;
      color: #f1f5f9;
    }

    .sidebar-nav {
      width: 260px;
      display: flex;
      flex-direction: column;
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border-right: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 0 25px rgba(0,0,0,0.3);
      transition: transform 0.3s ease-in-out;
      z-index: 100;
    }

    .nav-header {
      padding: 28px 22px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .nav-header h2 {
      font-size: 1.4rem;
      font-weight: 700;
      background: linear-gradient(135deg, #60a5fa, #2563eb);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 18px;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s;
      padding: 8px;
      border-radius: 10px;
    }

    .user-info:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .user-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1rem;
      color: white;
      box-shadow: 0 3px 10px rgba(37,99,235,0.4);
      flex-shrink: 0;
    }

    .user-details {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-weight: 600;
      font-size: 1rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-status {
      font-size: 0.8rem;
      color: #22c55e;
      font-weight: 500;
    }

    .nav-menu {
      flex: 1;
      padding: 15px 0;
    }

    .nav-item {
      width: 100%;
      padding: 14px 24px;
      border: none;
      background: none;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1rem;
      cursor: pointer;
      text-align: left;
      transition: all 0.25s ease;
      border-left: 3px solid transparent;
    }

    .nav-item:hover {
      background: rgba(255,255,255,0.05);
      color: #fff;
    }

    .nav-item.active {
      color: #fff;
      border-left: 3px solid #3b82f6;
      background: rgba(59,130,246,0.12);
    }

    .nav-footer {
      padding: 16px 20px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    .logout-btn {
      width: 100%;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-radius: 10px;
      color: #f87171;
      font-size: 0.95rem;
      font-weight: 600;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.25s ease-in-out;
    }

    .logout-btn:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #fff;
      box-shadow: 0 0 8px rgba(239,68,68,0.4);
      transform: translateY(-1px);
    }

    .main-content {
      flex: 1;
      background: #f8fafc;
      overflow: hidden;
      position: relative;
    }

    .mobile-header {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 58px;
      background: linear-gradient(135deg, #2563eb, #1e3a8a);
      color: white;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      z-index: 1000;
    }

    .menu-toggle {
      background: none;
      border: none;
      font-size: 1.4rem;
      color: white;
      cursor: pointer;
    }

    .mobile-title {
      font-weight: 700;
      font-size: 1.1rem;
    }

    .mobile-user {
      font-size: 0.85rem;
    }

    .mobile-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      z-index: 99;
    }

    .mobile-overlay.active {
      opacity: 1;
      pointer-events: all;
    }

    @media (max-width: 768px) {
      .mobile-header {
        display: flex;
      }
      .sidebar-nav {
        position: fixed;
        left: -260px;
        top: 0;
        bottom: 0;
        transform: translateX(0);
      }
      .sidebar-nav.mobile-open {
        transform: translateX(260px);
      }
      .main-content {
        margin-top: 58px;
      }
      .mobile-overlay {
        display: block;
      }
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  currentUser: User | null = null;
  mobileMenuOpen = false;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    try {
      await this.chatService.connectToHub();
    } catch (error) {
      console.error('Failed to connect to hub:', error);
    }
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  isActive(route: string): boolean {
    if (route === '/profile') {
      return this.router.url === route || this.router.url.startsWith('/profile/');
    }
    return this.router.url === route;
  }

  navigateTo(route: string): void {
    this.router.navigate([route]);
    this.closeMobileMenu();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

logout(): void {
  this.chatService.disconnectFromHub();

  this.authService.logout().subscribe({
    next: () => {
      this.router.navigate(['/login']);
    },
    error: () => {
      this.router.navigate(['/login']); // still logout UI even if API fails
    }
  });
}

}