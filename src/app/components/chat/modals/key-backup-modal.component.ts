// key-backup-modal.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { SignalRTokenService } from '../../../services/signalr-token.service';
import { CryptoService } from '../../../services/crypto.service';
import { environment } from '../../../../env/env';

@Component({
  selector: 'app-key-backup-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" *ngIf="visible">
      <div class="modal-box">

        <!-- STEP 1: Offer backup -->
        <ng-container *ngIf="step === 'offer'">
          <div class="icon">🔑</div>
          <h2>Back Up Your Encryption Key</h2>
          <p>
            Set a PIN to back up your encryption key. If you ever log in from
            a new device, you can use this PIN to restore access to your old messages.
          </p>
          <p class="sub">Without a backup, messages sent from this device
            cannot be read on other devices.</p>
          <div class="actions">
            <button class="btn-primary" (click)="step = 'set-pin'">Set Backup PIN</button>
            <button class="btn-secondary" (click)="skip()">Skip for Now</button>
          </div>
        </ng-container>

        <!-- STEP 2: Set PIN -->
        <ng-container *ngIf="step === 'set-pin'">
          <div class="icon">🔒</div>
          <h2>Create a Backup PIN</h2>
          <p>This PIN encrypts your key locally before uploading.
            The server never sees your PIN or unencrypted key.</p>

          <input
            type="password"
            [(ngModel)]="pin"
            placeholder="Enter PIN (min 6 characters)"
            class="pin-input"
            maxlength="20"
          />
          <input
            type="password"
            [(ngModel)]="pinConfirm"
            placeholder="Confirm PIN"
            class="pin-input"
            maxlength="20"
          />

          <p class="error" *ngIf="error">{{ error }}</p>

          <div class="actions">
            <button class="btn-primary" (click)="saveBackup()" [disabled]="loading">
              {{ loading ? 'Saving...' : 'Save Backup' }}
            </button>
            <button class="btn-secondary" (click)="skip()" [disabled]="loading">Skip</button>
          </div>
        </ng-container>

        <!-- STEP 3: Done -->
        <ng-container *ngIf="step === 'done'">
          <div class="icon">✅</div>
          <h2>Backup Saved</h2>
          <p>Your encryption key is backed up. You can restore it on any
            new device using your PIN.</p>
          <div class="actions">
            <button class="btn-primary" (click)="close()">Done</button>
          </div>
        </ng-container>

      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; backdrop-filter: blur(4px);
    }
    .modal-box {
      background: white; border-radius: 16px; padding: 36px;
      max-width: 420px; width: 90%;
      box-shadow: 0 24px 60px rgba(0,0,0,0.2); text-align: center;
    }
    .icon { font-size: 2.5rem; margin-bottom: 12px; }
    h2 { font-size: 1.3rem; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
    p  { color: #475569; font-size: 0.92rem; line-height: 1.6; margin-bottom: 10px; }
    .sub { font-size: 0.82rem; color: #94a3b8; }
    .pin-input {
      width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0;
      border-radius: 10px; font-size: 0.95rem; margin-bottom: 10px;
      box-sizing: border-box; outline: none;
    }
    .pin-input:focus { border-color: #2a74f5; }
    .error { color: #ef4444; font-size: 0.85rem; margin-bottom: 8px; }
    .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
    .btn-primary {
      background: #2a74f5; color: white; border: none;
      padding: 12px; border-radius: 10px; font-size: 0.95rem;
      font-weight: 600; cursor: pointer; transition: all 0.2s;
    }
    .btn-primary:hover:not(:disabled) { background: #1d64e0; }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-secondary {
      background: transparent; color: #64748b;
      border: 1px solid #e2e8f0; padding: 12px;
      border-radius: 10px; font-size: 0.9rem; cursor: pointer;
    }
    .btn-secondary:hover:not(:disabled) { background: #f8fafc; }
  `]
})
export class KeyBackupModalComponent implements OnInit, OnDestroy {
  visible     = false;
  step: 'offer' | 'set-pin' | 'done' = 'offer';
  pin         = '';
  pinConfirm  = '';
  error       = '';
  loading     = false;
  private destroy$ = new Subject<void>();

  constructor(
    private authService:   AuthService,
    private signalrtokenservice: SignalRTokenService,
    private cryptoService: CryptoService,
    private http:          HttpClient
  ) {}

  ngOnInit(): void {
    // Show after key generation completes on a fresh device
    this.authService.keyBackupRequired$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.visible = true;
        this.step    = 'offer';
      });
  }

  async saveBackup(): Promise<void> {
    this.error = '';

    if (this.pin.length < 6) {
      this.error = 'PIN must be at least 6 characters'; return;
    }
    if (this.pin !== this.pinConfirm) {
      this.error = 'PINs do not match'; return;
    }

    this.loading = true;
    try {
      const userId = this.authService.getCurrentUserId()!;
      const result = await this.cryptoService.exportEncryptedKeyBackup(userId, this.pin);
      if (!result) { this.error = 'Failed to export key'; return; }

      const token = this.signalrtokenservice.getNegotiationToken();
      await this.http.post(
        `${environment.apiUrl}/user/key-backup`,
        { encryptedKeyBackup: result.encryptedBackup, salt: result.salt },
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
      ).toPromise();

      this.step = 'done';
    } catch (err) {
      this.error = 'Failed to save backup. Please try again.';
      console.error(err);
    } finally {
      this.loading = false;
    }
  }

  skip():  void { this.visible = false; }
  close(): void { this.visible = false; }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}