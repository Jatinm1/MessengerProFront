// device-switch-modal.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { SignalRTokenService } from '../../../services/signalr-token.service';
import { HttpHeaders, HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../env/env';
import { CryptoService } from '../../../services/crypto.service';

// @Component({
//   selector: 'app-device-switch-modal',
//   standalone: true,
//   imports: [CommonModule],   // ← required for *ngIf
//   template: `
//     <div class="modal-overlay" *ngIf="visible">
//       <div class="modal-box">

//         <div class="modal-icon">🔐</div>
//         <h2>New Device Detected</h2>
//         <p>
//           You're signing in from a new device or browser.
//           To use end-to-end encryption here, this device needs to
//           become your active encryption device.
//         </p>

//         <div class="notice">
//           <strong>⚠️ Note:</strong> Messages encrypted on your previous
//           device won't be readable here. New messages will be encrypted
//           for this device going forward.
//         </div>

//         <div class="actions">
//           <button class="btn-primary" (click)="onUseThisDevice()" [disabled]="loading">
//             {{ loading ? 'Setting up...' : 'Use This Device for Encryption' }}
//           </button>
//           <button class="btn-secondary" (click)="onDismiss()" [disabled]="loading">
//             Continue Without Encryption
//           </button>
//         </div>

//         <p class="note">
//           You can switch devices again anytime by logging in from
//           another device and confirming there.
//         </p>
//       </div>
//     </div>
//   `,
//   styles: [`
//     .modal-overlay {
//       position: fixed;
//       inset: 0;
//       background: rgba(0, 0, 0, 0.55);
//       display: flex;
//       align-items: center;
//       justify-content: center;
//       z-index: 9999;
//       backdrop-filter: blur(4px);
//     }
//     .modal-box {
//       background: white;
//       border-radius: 16px;
//       padding: 36px;
//       max-width: 440px;
//       width: 90%;
//       box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
//       text-align: center;
//     }
//     .modal-icon {
//       font-size: 3rem;
//       margin-bottom: 12px;
//     }
//     h2 {
//       font-size: 1.4rem;
//       font-weight: 700;
//       color: #1e293b;
//       margin-bottom: 12px;
//     }
//     p {
//       color: #475569;
//       font-size: 0.95rem;
//       line-height: 1.6;
//       margin-bottom: 16px;
//     }
//     .notice {
//       background: #fef3c7;
//       border: 1px solid #fcd34d;
//       border-radius: 10px;
//       padding: 12px 16px;
//       font-size: 0.88rem;
//       color: #92400e;
//       margin-bottom: 24px;
//       text-align: left;
//     }
//     .actions {
//       display: flex;
//       flex-direction: column;
//       gap: 10px;
//     }
//     .btn-primary {
//       background: #2a74f5;
//       color: white;
//       border: none;
//       padding: 12px 24px;
//       border-radius: 10px;
//       font-size: 0.95rem;
//       font-weight: 600;
//       cursor: pointer;
//       transition: all 0.2s;
//     }
//     .btn-primary:hover:not(:disabled) {
//       background: #1d64e0;
//       transform: translateY(-1px);
//     }
//     .btn-primary:disabled {
//       opacity: 0.6;
//       cursor: not-allowed;
//     }
//     .btn-secondary {
//       background: transparent;
//       color: #64748b;
//       border: 1px solid #e2e8f0;
//       padding: 12px 24px;
//       border-radius: 10px;
//       font-size: 0.9rem;
//       cursor: pointer;
//       transition: all 0.2s;
//     }
//     .btn-secondary:hover:not(:disabled) {
//       background: #f8fafc;
//     }
//     .note {
//       font-size: 0.8rem;
//       color: #94a3b8;
//       margin-top: 16px;
//       margin-bottom: 0;
//     }
//   `]
// })
// export class DeviceSwitchModalComponent implements OnInit, OnDestroy {
//   visible         = false;
//   loading         = false;
//   private pendingUserId: string | null = null;
//   private destroy$ = new Subject<void>();

//   constructor(private authService: AuthService) {}

//   ngOnInit(): void {
//     this.authService.deviceSwitchRequired$
//       .pipe(takeUntil(this.destroy$))
//       .subscribe((userId) => {
//         console.log('🔐 [Modal] deviceSwitchRequired$ fired for', userId);
//         this.pendingUserId = userId;
//         this.visible       = true;
//       });

//     this.authService.deviceSwitchConfirmed$
//       .pipe(takeUntil(this.destroy$))
//       .subscribe(() => {
//         this.loading = false;
//         this.visible = false;
//         console.log('✅ [Modal] Device switch confirmed, modal closed');
//       });
//   }

//   async onUseThisDevice(): Promise<void> {
//     if (!this.pendingUserId) return;
//     this.loading = true;
//     try {
//       await this.authService.confirmDeviceSwitch(this.pendingUserId);
//     } catch (err) {
//       console.error('❌ [Modal] confirmDeviceSwitch failed:', err);
//       this.loading = false;
//     }
//   }

//   onDismiss(): void {
//     this.authService.declineDeviceSwitch();
//     this.visible = false;
//   }

//   ngOnDestroy(): void {
//     this.destroy$.next();
//     this.destroy$.complete();
//   }
// }

// device-switch-modal.component.ts — full replacement with PIN flow

@Component({
  selector: 'app-device-switch-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="visible">
      <div class="modal-box">

        <!-- STEP 1: Inform user -->
        <ng-container *ngIf="step === 'info'">
          <div class="modal-icon">🔐</div>
          <h2>New Device Detected</h2>
          <p>
            You're signing in from a new device or browser.
            To enable end-to-end encryption here, verify your identity
            with a PIN sent to your registered email.
          </p>
          <div class="notice">
            <strong>⚠️ Note:</strong> Messages from your previous device
            cannot be read here unless you backed up your key with a PIN.
          </div>
          <div class="actions">
            <button class="btn-primary" (click)="requestPin()" [disabled]="loading">
              {{ loading ? 'Sending PIN...' : 'Send Verification PIN to Email' }}
            </button>
            <button class="btn-secondary" (click)="dismiss()" [disabled]="loading">
              Continue Without Encryption
            </button>
          </div>
        </ng-container>

        <!-- STEP 2: Enter PIN -->
        <ng-container *ngIf="step === 'pin'">
          <div class="modal-icon">📧</div>
          <h2>Enter Verification PIN</h2>
          <p>We sent a 6-digit PIN to your registered email.
             It expires in <strong>10 minutes</strong>.</p>

          <div class="pin-boxes">
            <input
              *ngFor="let i of [0,1,2,3,4,5]"
              type="text"
              maxlength="1"
              inputmode="numeric"
              [id]="'pin-' + i"
              [(ngModel)]="pinDigits[i]"
              (input)="onDigitInput($event, i)"
              (keydown)="onDigitKeydown($event, i)"
              class="pin-digit"
            />
          </div>

          <p class="error" *ngIf="error">{{ error }}</p>
          <p class="resend">
            Didn't receive it?
            <button class="link-btn" (click)="requestPin()" [disabled]="resendCooldown > 0">
              {{ resendCooldown > 0 ? 'Resend in ' + resendCooldown + 's' : 'Resend PIN' }}
            </button>
          </p>

          <div class="actions">
            <button class="btn-primary" (click)="verifyPin()" [disabled]="loading || pinValue.length < 6">
              {{ loading ? 'Verifying...' : 'Verify & Switch Device' }}
            </button>
            <button class="btn-secondary" (click)="dismiss()" [disabled]="loading">
              Cancel
            </button>
          </div>
        </ng-container>

        <!-- STEP 3: Check for key backup -->
        <ng-container *ngIf="step === 'restore'">
          <div class="modal-icon">🗝️</div>
          <h2>Restore Old Messages?</h2>
          <p>
            A key backup was found. Enter your backup PIN to restore
            access to messages from your previous device.
          </p>
          <input
            type="password"
            [(ngModel)]="backupPin"
            placeholder="Enter backup PIN"
            class="pin-input"
            maxlength="20"
          />
          <p class="error" *ngIf="error">{{ error }}</p>
          <div class="actions">
            <button class="btn-primary" (click)="restoreBackup()" [disabled]="loading">
              {{ loading ? 'Restoring...' : 'Restore Key' }}
            </button>
            <button class="btn-secondary" (click)="skipRestore()" [disabled]="loading">
              Skip — Start Fresh
            </button>
          </div>
        </ng-container>

        <!-- STEP 4: Done -->
        <ng-container *ngIf="step === 'done'">
          <div class="modal-icon">✅</div>
          <h2>Device Switched Successfully</h2>
          <p>End-to-end encryption is now active on this device.</p>
          <div class="actions">
            <button class="btn-primary" (click)="close()">Start Chatting</button>
          </div>
        </ng-container>

      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; backdrop-filter: blur(4px);
    }
    .modal-box {
      background: white; border-radius: 16px; padding: 36px;
      max-width: 440px; width: 90%;
      box-shadow: 0 24px 60px rgba(0,0,0,0.2); text-align: center;
    }
    .modal-icon { font-size: 3rem; margin-bottom: 12px; }
    h2 { font-size: 1.4rem; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
    p  { color: #475569; font-size: 0.93rem; line-height: 1.6; margin-bottom: 12px; }
    .notice {
      background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px;
      padding: 12px 16px; font-size: 0.86rem; color: #92400e;
      margin-bottom: 20px; text-align: left;
    }
    .pin-boxes {
      display: flex; gap: 10px; justify-content: center; margin: 20px 0;
    }
    .pin-digit {
      width: 48px; height: 56px; text-align: center; font-size: 1.4rem;
      font-weight: 700; border: 2px solid #e2e8f0; border-radius: 10px;
      outline: none; transition: border-color 0.2s;
    }
    .pin-digit:focus { border-color: #2a74f5; }
    .pin-input {
      width: 100%; padding: 12px 14px; border: 1px solid #e2e8f0;
      border-radius: 10px; font-size: 0.95rem; margin-bottom: 10px;
      box-sizing: border-box; outline: none;
    }
    .pin-input:focus { border-color: #2a74f5; }
    .error  { color: #ef4444; font-size: 0.85rem; margin-bottom: 8px; }
    .resend { font-size: 0.83rem; color: #64748b; margin-bottom: 4px; }
    .link-btn {
      background: none; border: none; color: #2a74f5;
      cursor: pointer; font-size: 0.83rem; padding: 0;
      text-decoration: underline;
    }
    .link-btn:disabled { color: #94a3b8; cursor: not-allowed; text-decoration: none; }
    .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
    .btn-primary {
      background: #2a74f5; color: white; border: none; padding: 12px 24px;
      border-radius: 10px; font-size: 0.95rem; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    }
    .btn-primary:hover:not(:disabled) { background: #1d64e0; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-secondary {
      background: transparent; color: #64748b; border: 1px solid #e2e8f0;
      padding: 12px 24px; border-radius: 10px; font-size: 0.9rem; cursor: pointer;
    }
    .btn-secondary:hover:not(:disabled) { background: #f8fafc; }
    .note { font-size: 0.8rem; color: #94a3b8; margin-top: 12px; }
  `]
})
export class DeviceSwitchModalComponent implements OnInit, OnDestroy {
  visible  = false;
  loading  = false;
  error    = '';
  backupPin = '';
  step: 'info' | 'pin' | 'restore' | 'done' = 'info';
  pinDigits: string[] = ['', '', '', '', '', ''];
  resendCooldown = 0;
  private pendingUserId: string | null = null;
  private cooldownTimer: any;
  private destroy$ = new Subject<void>();

  get pinValue(): string { return this.pinDigits.join(''); }

  constructor(
    private authService:   AuthService,
    private signalrtokenservice: SignalRTokenService,
    private cryptoService: CryptoService,
    private http:          HttpClient
  ) {}

  ngOnInit(): void {
    this.authService.deviceSwitchRequired$
      .pipe(takeUntil(this.destroy$))
      .subscribe((userId) => {
        this.pendingUserId = userId;
        this.visible       = true;
        this.step          = 'info';
        this.reset();
      });

    this.authService.deviceSwitchConfirmed$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loading = false;
        this.visible = false;
      });
  }

  async requestPin(): Promise<void> {
    this.loading = true;
    this.error   = '';
    try {
      const token = this.signalrtokenservice.getNegotiationToken();
      await this.http.post(
        `${environment.apiUrl}/user/device-switch/request-pin`, {},
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
      ).toPromise();

      this.step = 'pin';
      this.startResendCooldown();
    } catch (err) {
      this.error = 'Failed to send PIN. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  async verifyPin(): Promise<void> {
    if (this.pinValue.length < 6) return;
    this.loading = true;
    this.error   = '';

    try {
      const token = this.signalrtokenservice.getNegotiationToken();
      await this.http.post(
        `${environment.apiUrl}/user/device-switch/verify-pin`,
        { pin: this.pinValue },
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
      ).toPromise();

      // PIN verified — check if a key backup exists
      const backup = await this.checkForKeyBackup();
      if (backup) {
        this.step = 'restore';
      } else {
        await this.authService.confirmDeviceSwitch(this.pendingUserId!);
        this.step = 'done';
      }
    } catch (err: any) {
      this.error = err?.error?.error ?? 'Verification failed. Please try again.';
      this.pinDigits = ['', '', '', '', '', ''];
    } finally {
      this.loading = false;
    }
  }

private async checkForKeyBackup(): Promise<any | null> {
  try {
    const token = this.signalrtokenservice.getNegotiationToken();
    return await this.http.get(
      `${environment.apiUrl}/user/key-backup`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    ).toPromise();
  } catch (err: any) {
    if (err?.status === 404) return null; // no backup — expected
    console.error('Error checking key backup:', err);
    return null;
  }
}

  async restoreBackup(): Promise<void> {
  if (!this.backupPin || !this.pendingUserId) return;
  this.loading = true;
  this.error   = '';

  try {
    const token = this.signalrtokenservice.getNegotiationToken();
    const backup: any = await this.http.get(
      `${environment.apiUrl}/user/key-backup`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    ).toPromise();

    // Decrypt backup blob and store restored private key in IndexedDB
    const ok = await this.cryptoService.importEncryptedKeyBackup(
      this.pendingUserId,
      backup.encryptedKeyBackup,
      backup.salt,
      this.backupPin
    );

    if (!ok) {
      this.error = 'Incorrect backup PIN. Try again or skip to start fresh.';
      this.loading = false;
      return;
    }

    // ✅ KEY FIX: use confirmDeviceSwitchAfterRestore, NOT confirmDeviceSwitch
    // confirmDeviceSwitch generates NEW keys — that would overwrite the restored key
    // confirmDeviceSwitchAfterRestore only re-registers the public key on the server
    await this.authService.confirmDeviceSwitchAfterRestore(this.pendingUserId);
    this.step = 'done';

  } catch (err) {
    this.error = 'Restore failed. Please try again.';
    console.error('❌ restoreBackup error:', err);
  } finally {
    this.loading = false;
  }
}

async skipRestore(): Promise<void> {
  if (!this.pendingUserId) return;
  this.loading = true;
  // Fresh start — generates new keys, old messages unreadable, new backup prompted
  await this.authService.confirmDeviceSwitch(this.pendingUserId);
  this.step    = 'done';
  this.loading = false;
}

  dismiss(): void {
    this.authService.declineDeviceSwitch();
    this.visible = false;
  }

  close(): void { this.visible = false; }

  // Auto-advance PIN input boxes
  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const val   = input.value.replace(/\D/g, '');
    this.pinDigits[index] = val.slice(-1);
    if (val && index < 5) {
      document.getElementById(`pin-${index + 1}`)?.focus();
    }
  }

  onDigitKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.pinDigits[index] && index > 0) {
      document.getElementById(`pin-${index - 1}`)?.focus();
    }
  }

  private startResendCooldown(): void {
    this.resendCooldown = 30;
    this.cooldownTimer  = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) clearInterval(this.cooldownTimer);
    }, 1000);
  }

  private reset(): void {
    this.pinDigits    = ['', '', '', '', '', ''];
    this.error        = '';
    this.backupPin    = '';
    this.loading      = false;
    this.resendCooldown = 0;
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }
}