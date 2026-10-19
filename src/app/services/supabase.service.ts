import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Client, StorageImage } from '../models/client.model';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase!: SupabaseClient;
  private readonly bucketName = environment.storageBucket || 'gallery';

  // Señales reactivas de estado de autenticación y autorización (RBAC)
  readonly currentUser = signal<User | null>(null);
  readonly userRole = signal<'admin' | 'user' | null>(null);
  readonly isConfigured = signal<boolean>(false);

  // Datos iniciales de respaldo (idénticos a supabase/setup.sql) cuando aún no se ha conectado una URL propia
  private fallbackClients: Client[] = [
    {
      id: 'c1a8b9d0-1111-4a2b-8c3d-000000000001',
      nombre: 'Elena Martínez Vega',
      empresa: 'Nebrija Tech Solutions',
      email: 'elena.martinez@nebrijatech.es',
      created_at: '2026-10-18T09:30:00Z'
    },
    {
      id: 'c1a8b9d0-2222-4a2b-8c3d-000000000002',
      nombre: 'Carlos Mendoza Ruiz',
      empresa: 'CloudSystems Iberia S.L.',
      email: 'cmendoza@cloudsystems.es',
      created_at: '2026-10-18T11:15:00Z'
    },
    {
      id: 'c1a8b9d0-3333-4a2b-8c3d-000000000003',
      nombre: 'Sofía Alarcón Torres',
      empresa: 'Innova Data Studio',
      email: 'sofia.alarcon@innovadata.io',
      created_at: '2026-10-19T08:45:00Z'
    }
  ];

  private fallbackImages: StorageImage[] = [
    {
      name: '1729328100_dashboard-cloud-architecture.jpg',
      url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80',
      created_at: '2026-10-18T10:15:00Z',
      size: 248320
    },
    {
      name: '1729329400_datacenter-supabase-cluster.jpg',
      url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=900&q=80',
      created_at: '2026-10-18T14:40:00Z',
      size: 315904
    },
    {
      name: '1729331200_equipo-desarrollo-dam.jpg',
      url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80',
      created_at: '2026-10-19T09:20:00Z',
      size: 194560
    }
  ];

  constructor() {
    this.initializeClient();
    this.initSession();
  }

  /**
   * Inicializa el cliente de Supabase tomando las variables de environment.ts
   * (o credenciales guardadas dinámicamente en localStorage).
   */
  private initializeClient(): void {
    const storedUrl = localStorage.getItem('dam_supabase_url')?.trim();
    const storedKey = localStorage.getItem('dam_supabase_key')?.trim();

    const url = storedUrl || environment.supabaseUrl;
    const key = storedKey || environment.supabaseKey;

    const configured =
      Boolean(url && key) &&
      !url.includes('tu-proyecto-id') &&
      !key.includes('reemplaza_con_tu_anon_key');

    this.isConfigured.set(configured);
    this.supabase = createClient(url, key);
  }

  async updateCredentials(url: string, key: string): Promise<void> {
    localStorage.setItem('dam_supabase_url', url.trim());
    localStorage.setItem('dam_supabase_key', key.trim());
    this.initializeClient();
    await this.initSession();
  }

  getActiveConfig(): { url: string; key: string; bucket: string } {
    return {
      url: localStorage.getItem('dam_supabase_url') || environment.supabaseUrl,
      key: localStorage.getItem('dam_supabase_key') || environment.supabaseKey,
      bucket: this.bucketName
    };
  }

  /**
   * Recupera la sesión inicial y mantiene sincronizadas las Signals
   * mediante el listener en tiempo real onAuthStateChange.
   */
  async initSession(): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (!error && data.session?.user) {
        this.currentUser.set(data.session.user);
        await this.loadRole(data.session.user.id);
      } else {
        this.currentUser.set(null);
        this.userRole.set(null);
      }

      this.supabase.auth.onAuthStateChange(async (_event, session) => {
        const user = session?.user ?? null;
        this.currentUser.set(user);
        if (user) {
          await this.loadRole(user.id);
        } else {
          this.userRole.set(null);
        }
      });
    } catch (err) {
      console.error('Error inicializando sesión de Supabase:', err);
    }
  }

  /**
   * Inicia sesión con email y contraseña contra Supabase Auth
   * y carga inmediatamente el rol asignado en public.profiles.
   */
  async login(email: string, password: string): Promise<User> {
    if (!this.isConfigured()) {
      const mockUser = {
        id: '00000000-0000-4000-8000-000000000001',
        email: email.trim(),
        aud: 'authenticated',
        role: 'authenticated',
        created_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {}
      } as User;

      this.currentUser.set(mockUser);
      this.userRole.set('admin');
      return mockUser;
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error('No se pudo obtener la información del usuario.');
    }

    this.currentUser.set(data.user);
    await this.loadRole(data.user.id);
    return data.user;
  }

  /**
   * Cierra la sesión activa y limpia las señales reactivas.
   */
  async logout(): Promise<void> {
    if (this.isConfigured()) {
      const { error } = await this.supabase.auth.signOut();
      if (error) {
        throw error;
      }
    }
    this.currentUser.set(null);
    this.userRole.set(null);
  }

  /**
   * Consulta la tabla public.profiles para obtener el rol del usuario ('admin' | 'user').
   */
  async loadRole(userId: string): Promise<'admin' | 'user' | null> {
    if (!this.isConfigured()) {
      this.userRole.set('admin');
      return 'admin';
    }

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        this.userRole.set('admin');
        return 'admin';
      }

      const resolvedRole = (data?.role as 'admin' | 'user') ?? 'admin';
      this.userRole.set(resolvedRole);
      return resolvedRole;
    } catch {
      this.userRole.set('admin');
      return 'admin';
    }
  }

  // ===========================================================================
  // MÉTODOS CRUD PARA PUBLIC.CLIENTS
  // ===========================================================================

  async getClients(): Promise<Client[]> {
    if (!this.isConfigured()) {
      return [...this.fallbackClients];
    }

    const { data, error } = await this.supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data as Client[]) ?? [];
  }

  async createClient(client: Client): Promise<Client> {
    if (!this.isConfigured()) {
      const newClient: Client = {
        id: crypto.randomUUID(),
        nombre: client.nombre.trim(),
        empresa: client.empresa.trim(),
        email: client.email.trim().toLowerCase(),
        created_at: new Date().toISOString()
      };
      this.fallbackClients = [newClient, ...this.fallbackClients];
      return newClient;
    }

    const { data, error } = await this.supabase
      .from('clients')
      .insert([
        {
          nombre: client.nombre.trim(),
          empresa: client.empresa.trim(),
          email: client.email.trim().toLowerCase()
        }
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as Client;
  }

  async updateClient(id: string, client: Partial<Client>): Promise<Client> {
    if (!this.isConfigured()) {
      const idx = this.fallbackClients.findIndex((c) => c.id === id);
      if (idx !== -1) {
        this.fallbackClients[idx] = {
          ...this.fallbackClients[idx],
          nombre: client.nombre?.trim() || this.fallbackClients[idx].nombre,
          empresa: client.empresa?.trim() || this.fallbackClients[idx].empresa,
          email: client.email?.trim().toLowerCase() || this.fallbackClients[idx].email
        };
        return this.fallbackClients[idx];
      }
      throw new Error('Cliente no encontrado');
    }

    const { data, error } = await this.supabase
      .from('clients')
      .update({
        nombre: client.nombre?.trim(),
        empresa: client.empresa?.trim(),
        email: client.email?.trim().toLowerCase()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as Client;
  }

  async deleteClient(id: string): Promise<void> {
    if (!this.isConfigured()) {
      this.fallbackClients = this.fallbackClients.filter((c) => c.id !== id);
      return;
    }

    const { error } = await this.supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }
  }

  // ===========================================================================
  // MÉTODOS PARA SUPABASE STORAGE BUCKET ('gallery')
  // ===========================================================================

  async getBucketImages(): Promise<StorageImage[]> {
    if (!this.isConfigured()) {
      return [...this.fallbackImages];
    }

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list('', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data
      .filter(
        (file) =>
          file.name !== '.emptyFolderPlaceholder' &&
          !file.name.startsWith('.') &&
          Boolean(file.id)
      )
      .map((file) => {
        const { data: publicUrlData } = this.supabase.storage
          .from(this.bucketName)
          .getPublicUrl(file.name);

        return {
          name: file.name,
          url: publicUrlData.publicUrl,
          created_at: file.created_at ?? undefined,
          size: typeof file.metadata?.['size'] === 'number' ? file.metadata['size'] : undefined
        };
      });
  }

  async uploadImage(file: File): Promise<void> {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFileName = `${Date.now()}_${cleanName}`;

    if (!this.isConfigured()) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });

      this.fallbackImages = [
        {
          name: uniqueFileName,
          url: dataUrl,
          created_at: new Date().toISOString(),
          size: file.size
        },
        ...this.fallbackImages
      ];
      return;
    }

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .upload(uniqueFileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg'
      });

    if (error) {
      throw error;
    }
  }

  async deleteImage(fileName: string): Promise<void> {
    if (!this.isConfigured()) {
      this.fallbackImages = this.fallbackImages.filter((img) => img.name !== fileName);
      return;
    }

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .remove([fileName]);

    if (error) {
      throw error;
    }
  }
}
