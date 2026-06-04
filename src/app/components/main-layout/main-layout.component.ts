// ============================================================
// src/app/components/main-layout/main-layout.component.ts
// MODIFIED FILE — Fixes:
//   VULN-028: logout() uses navigateByUrl with replaceUrl: true
//             so back-button cannot return to protected layout.
// ============================================================
import { Component, OnInit } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService }       from '../../services/auth.service';
import { ChatService }       from '../../services/chat.service';
import { User }              from '../../models/chat.models';

@Component({
  selector:    'app-main-layout',
  standalone:  true,
  imports:     [CommonModule, RouterOutlet],
  templateUrl: './main-layout.component.html',
  styleUrls:   ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit {
  currentUser: User | null = null;
  mobileMenuOpen = false;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router:      Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;

      if (!user) {
        // VULN-028: replaceUrl: true so back() skips this page
        this.router.navigateByUrl('/auth', { replaceUrl: true });
      }
    });

    try {
      await this.chatService.connectToHub();
    } catch (error) {
      console.error('Failed to connect to hub:', error);
    }
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  onImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    imgElement.style.display = 'none';
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
    this.authService.logout().subscribe({
      next: () => {
        this.chatService.disconnectFromHub();
        // VULN-028: replaceUrl replaces history entry — back() goes
        // to wherever the user was before opening the app, not to /chat.
        this.router.navigateByUrl('/auth', { replaceUrl: true });
      },
      error: () => {
        this.chatService.disconnectFromHub();
        this.router.navigateByUrl('/auth', { replaceUrl: true });
      }
    });
  }
}