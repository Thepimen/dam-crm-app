export interface Client {
  id?: string;
  nombre: string;
  empresa: string;
  email: string;
  created_at?: string;
}

export interface StorageImage {
  name: string;
  url: string;
  created_at?: string;
  size?: number;
}
