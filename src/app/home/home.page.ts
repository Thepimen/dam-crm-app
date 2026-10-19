import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
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
  IonItem,
  IonInput,
  IonLabel,
  IonList,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonSpinner,
  IonModal,
  IonNote,
  IonChip,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  imagesOutline,
  logInOutline,
  logOutOutline,
  personAddOutline,
  createOutline,
  trashOutline,
  saveOutline,
  closeCircleOutline,
  shieldCheckmarkOutline,
  lockClosedOutline,
  businessOutline,
  mailOutline,
  personOutline,
  refreshOutline,
  settingsOutline,
  keyOutline
} from 'ionicons/icons';
import { SupabaseService } from '../services/supabase.service';
import { Client } from '../models/client.model';

type PendingAction =
  | { type: 'save' }
  | { type: 'edit'; client: Client }
  | { type: 'delete'; client: Client }
  | null;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
    IonItem,
    IonInput,
    IonLabel,
    IonList,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonSpinner,
    IonModal,
    IonNote,
    IonChip
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss']
})
export class HomePage implements OnInit {
  readonly supabaseService = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly toastCtrl = inject(ToastController);

  // Signals de la vista
  readonly clients = signal<Client[]>([]);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly editingClientId = signal<string | null>(null);

  // Estado del Modal de Login bajo demanda (Interceptor CUD)
  readonly isLoginModalOpen = signal<boolean>(false);
  readonly loginLoading = signal<boolean>(false);
  readonly loginError = signal<string | null>(null);
  readonly pendingActionLabel = signal<string | null>(null);
  private pendingAction: PendingAction = null;

  // Estado del Modal de Configuración rápida de credenciales Supabase
  readonly isConfigModalOpen = signal<boolean>(false);
  configUrl = '';
  configKey = '';

  // Formularios Reactivos
  readonly clientForm: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    empresa: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]]
  });

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  // Exposición de las signals del servicio para la plantilla
  readonly currentUser = this.supabaseService.currentUser;
  readonly userRole = this.supabaseService.userRole;
  readonly isConfigured = this.supabaseService.isConfigured;

  constructor() {
    addIcons({
      imagesOutline,
      logInOutline,
      logOutOutline,
      personAddOutline,
      createOutline,
      trashOutline,
      saveOutline,
      closeCircleOutline,
      shieldCheckmarkOutline,
      lockClosedOutline,
      businessOutline,
      mailOutline,
      personOutline,
      refreshOutline,
      settingsOutline,
      keyOutline
    });
  }

  async ngOnInit(): Promise<void> {
    const cfg = this.supabaseService.getActiveConfig();
    this.configUrl = cfg.url;
    this.configKey = cfg.key;
    await this.loadClients();
  }

  /**
   * Carga el listado de clientes desde Supabase (permitido para anon y authenticated).
   */
  async loadClients(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.supabaseService.getClients();
      this.clients.set(data);
    } catch (err: any) {
      await this.presentToast(
        `Error al cargar clientes: ${err?.message || 'Verifica la conexión con Supabase'}`,
        'danger'
      );
    } finally {
      this.loading.set(false);
    }
  }

  // ===========================================================================
  // INTERCEPTOR DE SEGURIDAD: LOGIN BAJO DEMANDA EN INSERTAR, EDITAR Y ELIMINAR
  // ===========================================================================

  /**
   * Se invoca al pulsar "Guardar / Insertar" o "Actualizar Cliente".
   * Si no hay sesión activa (!currentUser()), intercepta la acción y abre el modal de Login.
   */
  async onSubmitClient(): Promise<void> {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      await this.presentToast('Completa correctamente todos los campos del formulario.', 'warning');
      return;
    }

    if (!this.currentUser()) {
      const actionText = this.editingClientId()
        ? 'actualizar el cliente seleccionado'
        : 'insertar un nuevo cliente';
      this.openLoginForPendingAction({ type: 'save' }, actionText);
      return;
    }

    await this.executeSaveClient();
  }

  /**
   * Se invoca al pulsar "Editar" sobre un cliente.
   * Si no hay sesión activa (!currentUser()), solicita Login antes de cargar la edición.
   */
  onRequestEdit(client: Client, slidingItem?: IonItemSliding): void {
    if (slidingItem) {
      slidingItem.close();
    }

    if (!this.currentUser()) {
      this.openLoginForPendingAction(
        { type: 'edit', client },
        `editar el cliente "${client.nombre}"`
      );
      return;
    }

    this.populateFormForEdit(client);
  }

  /**
   * Se invoca al pulsar "Eliminar" sobre un cliente.
   * Si no hay sesión activa (!currentUser()), solicita Login antes de ejecutar el borrado.
   */
  async onRequestDelete(client: Client, slidingItem?: IonItemSliding): Promise<void> {
    if (slidingItem) {
      slidingItem.close();
    }

    if (!this.currentUser()) {
      this.openLoginForPendingAction(
        { type: 'delete', client },
        `eliminar el cliente "${client.nombre}"`
      );
      return;
    }

    await this.executeDeleteClient(client);
  }

  /**
   * Abre el modal de Login guardando la acción CUD pendiente para ejecutarla tras autenticar.
   */
  openLoginForPendingAction(action: PendingAction, description: string | null = null): void {
    this.pendingAction = action;
    this.pendingActionLabel.set(description);
    this.loginError.set(null);
    this.isLoginModalOpen.set(true);
  }

  /**
   * Abre el modal de Login manualmente desde el botón de la barra superior.
   */
  openManualLoginModal(): void {
    this.openLoginForPendingAction(null, null);
  }

  closeLoginModal(): void {
    this.isLoginModalOpen.set(false);
    this.loginError.set(null);
    this.pendingAction = null;
    this.pendingActionLabel.set(null);
  }

  /**
   * Procesa el formulario del modal de Login contra Supabase Auth,
   * verifica el rol en public.profiles y reanuda la acción pendiente.
   */
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
      const role = this.userRole();

      this.isLoginModalOpen.set(false);
      this.loginForm.reset();

      await this.presentToast(
        `Sesión iniciada como ${user.email} (Rol: ${role?.toUpperCase() || 'ADMIN'})`,
        'success'
      );

      // Si existía una operación CUD interceptada, verificar rol y completarla automáticamente
      const actionToRun = this.pendingAction;
      this.pendingAction = null;
      this.pendingActionLabel.set(null);

      if (actionToRun) {
        if (role !== 'admin') {
          await this.presentToast(
            'Acceso denegado: Se requiere rol ADMIN en public.profiles para modificar clientes.',
            'danger'
          );
          return;
        }

        if (actionToRun.type === 'save') {
          await this.executeSaveClient();
        } else if (actionToRun.type === 'edit') {
          this.populateFormForEdit(actionToRun.client);
          await this.presentToast(
            `Modo edición activado para "${actionToRun.client.nombre}"`,
            'primary'
          );
        } else if (actionToRun.type === 'delete') {
          await this.executeDeleteClient(actionToRun.client);
        }
      }
    } catch (err: any) {
      this.loginError.set(
        err?.message || 'Credenciales incorrectas o usuario no registrado en Supabase Auth.'
      );
    } finally {
      this.loginLoading.set(false);
    }
  }

  async onLogout(): Promise<void> {
    try {
      await this.supabaseService.logout();
      this.cancelEdit();
      await this.presentToast('Has cerrado sesión correctamente.', 'medium');
    } catch (err: any) {
      await this.presentToast(`Error al cerrar sesión: ${err?.message}`, 'danger');
    }
  }

  // ===========================================================================
  // EJECUCIÓN EFECTIVA DE OPERACIONES CUD (CREATE, UPDATE, DELETE)
  // ===========================================================================

  private populateFormForEdit(client: Client): void {
    this.editingClientId.set(client.id ?? null);
    this.clientForm.patchValue({
      nombre: client.nombre,
      empresa: client.empresa,
      email: client.email
    });
  }

  cancelEdit(): void {
    this.editingClientId.set(null);
    this.clientForm.reset();
  }

  private async executeSaveClient(): Promise<void> {
    if (this.userRole() !== 'admin') {
      await this.presentToast(
        'Operación bloqueada: Tu usuario no tiene rol "admin" en public.profiles.',
        'danger'
      );
      return;
    }

    this.saving.set(true);
    const payload: Client = this.clientForm.value;
    const currentId = this.editingClientId();

    try {
      if (currentId) {
        await this.supabaseService.updateClient(currentId, payload);
        await this.presentToast('Cliente actualizado correctamente en Supabase.', 'success');
      } else {
        await this.supabaseService.createClient(payload);
        await this.presentToast('Nuevo cliente insertado correctamente en Supabase.', 'success');
      }

      this.cancelEdit();
      await this.loadClients();
    } catch (err: any) {
      await this.presentToast(
        `Error al guardar en Supabase: ${err?.message || 'Verifica las políticas RLS'}`,
        'danger'
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async executeDeleteClient(client: Client): Promise<void> {
    if (!client.id) {
      return;
    }

    if (this.userRole() !== 'admin') {
      await this.presentToast(
        'Operación bloqueada: Tu usuario no tiene rol "admin" en public.profiles.',
        'danger'
      );
      return;
    }

    this.loading.set(true);
    try {
      await this.supabaseService.deleteClient(client.id);
      if (this.editingClientId() === client.id) {
        this.cancelEdit();
      }
      await this.presentToast(`Cliente "${client.nombre}" eliminado correctamente.`, 'success');
      await this.loadClients();
    } catch (err: any) {
      await this.presentToast(
        `Error al eliminar cliente: ${err?.message || 'Verifica permisos RLS'}`,
        'danger'
      );
    } finally {
      this.loading.set(false);
    }
  }

  // ===========================================================================
  // CONFIGURACIÓN RÁPIDA DE SUPABASE (SI AÚN NO SE HA EDITADO ENVIRONMENT.TS)
  // ===========================================================================

  openConfigModal(): void {
    const cfg = this.supabaseService.getActiveConfig();
    this.configUrl = cfg.url;
    this.configKey = cfg.key;
    this.isConfigModalOpen.set(true);
  }

  async saveSupabaseConfig(): Promise<void> {
    if (!this.configUrl.trim().startsWith('http') || !this.configKey.trim()) {
      await this.presentToast(
        'Introduce una URL válida (https://...) y tu Anon Key de Supabase.',
        'warning'
      );
      return;
    }

    await this.supabaseService.updateCredentials(this.configUrl, this.configKey);
    this.isConfigModalOpen.set(false);
    await this.presentToast('Conexión a Supabase actualizada correctamente.', 'success');
    await this.loadClients();
  }

  private async presentToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'primary' | 'medium' = 'primary'
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      position: 'bottom',
      color
    });
    await toast.present();
  }
}
