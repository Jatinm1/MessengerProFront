import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login">
      <h2>Login</h2>
      <input [(ngModel)]="userName" placeholder="Username" />
      <input [(ngModel)]="password" type="password" placeholder="Password" />
      <button (click)="login()">Login</button>
      <div *ngIf="errorMessage" class="error">{{ errorMessage }}</div>
    </div>
  `,
  styles: [`
    .login {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #ece5dd;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
    }
    .login input {
      margin: 5px;
      padding: 10px;
      width: 220px;
      border-radius: 6px;
      border: 1px solid #ccc;
    }
    .login button {
      margin-top: 10px;
      padding: 10px 15px;
      background: #075e54;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .login button:hover {
      background: #0b8457;
    }
    .error {
      color: red;
      margin-top: 10px;
    }
  `]
})
export class LoginComponent {
  userName = '';
  password = '';
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  login(): void {
    this.authService.login(this.userName, this.password).subscribe({
      next: () => {
        this.router.navigate(['/chat']);
      },
      error: (err) => {
        this.errorMessage = 'Login failed. Please check your credentials.';
        console.error('Login error:', err);
      }
    });
  }
}