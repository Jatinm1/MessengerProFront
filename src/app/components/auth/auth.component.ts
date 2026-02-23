import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent {

  isLoginMode = true;

  // Login fields
  loginUserName = '';
  loginPassword = '';

  // Register fields
  registerUserName = '';
  registerDisplayName = '';
  registerPassword = '';

  errorMessage = '';
  successMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.successMessage = '';
  }

  login() {
    this.authService.login(this.loginUserName, this.loginPassword).subscribe({
      next: () => this.router.navigate(['/chat']),
      error: () => {
        this.errorMessage = 'Invalid credentials';
      }
    });
  }

  register() {
    this.authService.register(
      this.registerUserName,
      this.registerDisplayName,
      this.registerPassword
    ).subscribe({
      next: () => {
        this.successMessage = 'Account created successfully!';
        setTimeout(() => {
          this.isLoginMode = true; // switch to login
          this.successMessage = '';
        }, 1500);
      },
      error: () => {
        this.errorMessage = 'Registration failed';
      }
    });
  }
}