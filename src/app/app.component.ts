// app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DeviceSwitchModalComponent } from './components/chat/modals/device-switch-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DeviceSwitchModalComponent],
  templateUrl: './app.component.html',  // ← point to the HTML file
  styles: []
})
export class AppComponent {}