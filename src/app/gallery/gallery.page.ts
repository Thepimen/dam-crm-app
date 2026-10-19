import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonBadge,
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonSpinner,
  IonModal,
  IonItem,
  IonInput,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cloudUploadOutline,
  imagesOutline,
  openOutline,
  copyOutline,
  refreshOutline,
  trashOutline,
  logInOutline,
  logOutOutline,
  lockClosedOutline,
  mailOutline,
  keyOutline
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase.service';
import { StorageImage } from '../models/client.model';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonBadge,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonSpinner,
    IonModal,
    IonItem,
    IonInput
  ],
  templateUrl: './gallery.page.html',
  styleUrls: ['./gallery.page.scss']
})
export class GalleryPage implements OnInit {
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  readonly supabaseService = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly toastCtrl = inject(ToastController);

  readonly images = signal<StorageImage[]>([]);
  readonly loading = signal<boolean>(false);
  readonly uploading = signal<boolean>(false);

  // Estado del Modal de Login bajo demanda al intentar Subir o Eliminar imagen
  readonly isLoginModalOpen = signal<boolean>(false);
  readonly loginLoading = signal<boolean>(false);
  readonly loginError = signal<string | null>(null);
  private pendingUploadAfterLogin = false;

  readonly currentUser = this.supabaseService.currentUser;
  readonly userRole = this.supabaseService.userRole;
  readonly isConfigured = this.supabaseService.isConfigured;

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  constructor() {
    addIcons({
      arrowBackOutline,
      cloudUploadOutline,
      imagesOutline,
      openOutline,
      copyOutline,
      refreshOutline,
      trashOutline,
      logInOutline,
      logOutOutline,
      lockClosedOutline,
      mailOutline,
      keyOutline
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadImages();
  }

  /**
   * Recupera todas las imágenes almacenadas en el Storage Bucket 'gallery'.
   */
  async loadImages(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.supabaseService.getBucketImages();
      this.images.set(list);
    } catch (err: any) {
      await this.presentToast(
        `Error al listar el bucket 'gallery': ${err?.message || 'Verifica que el bucket exista en Supabase'}`,
        'danger'
      );
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Al pulsar "Subir Imagen", comprueba si el usuario está autenticado.
   * Si no lo está, solicita Login bajo demanda antes de abrir el selector de archivos.
   */
  onTriggerUpload(): void {
    if (!this.currentUser()) {
      this.pendingUploadAfterLogin = true;
      this.loginError.set(null);
      this.isLoginModalOpen.set(true);
      return;
    }

    this.fileInputRef?.nativeElement.click();
  }

  /**
   * Sube el archivo seleccionado al bucket 'gallery' y refresca las cards al instante.
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.uploading.set(true);
    try {
      await this.supabaseService.uploadImage(file);
      await this.presentToast(
        `Imagen "${file.name}" subida correctamente al bucket 'gallery'.`,
        'success'
      );
      await this.loadImages();
    } catch (err: any) {
      await this.presentToast(
        `Error al subir imagen: ${err?.message || 'Verifica las políticas RLS de storage.objects'}`,
        'danger'
      );
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  /**
   * Elimina una imagen del bucket 'gallery' (requiere sesión activa).
   */
  async onDeleteImage(img: StorageImage): Promise<void> {
    if (!this.currentUser()) {
      this.pendingUploadAfterLogin = false;
      this.loginError.set(null);
      this.isLoginModalOpen.set(true);
      return;
    }

    this.loading.set(true);
    try {
      await this.supabaseService.deleteImage(img.name);
      await this.presentToast(`Imagen "${img.name}" eliminada del bucket.`, 'success');
      await this.loadImages();
    } catch (err: any) {
      await this.presentToast(`No se pudo eliminar la imagen: ${err?.message}`, 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Copia la URL pública de la imagen al portapapeles.
   */
  async copyPublicUrl(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      await this.presentToast('URL pública copiada al portapapeles.', 'primary');
    } catch {
      window.open(url, '_blank');
    }
  }

  openOriginalImage(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  formatSubtitle(img: StorageImage): string {
    const parts: string[] = [];
    if (img.size) {
      const kb = (img.size / 1024).toFixed(1);
      parts.push(`${kb} KB`);
    }
    if (img.created_at) {
      const dateStr = new Date(img.created_at).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      parts.push(dateStr);
    }
    return parts.length > 0 ? parts.join(' • ') : 'Bucket público: gallery';
  }

  closeLoginModal(): void {
    this.isLoginModalOpen.set(false);
    this.loginError.set(null);
    this.pendingUploadAfterLogin = false;
  }

  async onConfirmLogin(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loginLoading.set(true);
    this.loginError.set(null);
    const { email, password } = this.loginForm.value;

    try {
      const user = await this.supabaseService.login(email, password);
      this.isLoginModalOpen.set(false);
      this.loginForm.reset();

      await this.presentToast(`Autenticado como ${user.email}`, 'success');

      if (this.pendingUploadAfterLogin) {
        this.pendingUploadAfterLogin = false;
        setTimeout(() => {
          this.fileInputRef?.nativeElement.click();
        }, 250);
      }
    } catch (err: any) {
      this.loginError.set(err?.message || 'Error al iniciar sesión en Supabase Auth.');
    } finally {
      this.loginLoading.set(false);
    }
  }

  private async presentToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'primary' = 'primary'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color
    });
    await toast.present();
  }
}
