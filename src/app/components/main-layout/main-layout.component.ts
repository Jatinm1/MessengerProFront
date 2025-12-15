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
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
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
    // 🔥 Listen for live updates
    this.authService.currentUser$
      .subscribe(user => {
        this.currentUser = user;

        // If NOT logged in, redirect
        if (!user) {
          this.router.navigate(['/login']);
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
    // The initials will automatically show because the image is hidden
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