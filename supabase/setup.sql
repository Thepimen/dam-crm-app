-- =============================================================================
-- PROYECTO: dam-crm-app (Módulo 0488 - Desarrollo de Interfaces - 2º DAM)
-- ARCHIVO:  supabase/setup.sql
-- DESCRIPCIÓN: Configuración completa de esquema, RBAC, Triggers, RLS y Storage
-- =============================================================================

-- 1. EXTENSIONES Y TIPOS BASE
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('admin', 'user');
    END IF;
END
$$;

-- 2. TABLA DE PERFILES (RBAC)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    role public.user_role DEFAULT 'admin' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TRIGGER AUTOMÁTICO PARA NUEVOS USUARIOS EN AUTH.USERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Sincronización preventiva para usuarios ya existentes en auth.users
INSERT INTO public.profiles (id, role)
SELECT id, 'admin'::public.user_role FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 4. TABLA DE CLIENTES (CRM)
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    empresa TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SEGURIDAD A NIVEL DE FILA (ROW LEVEL SECURITY - RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Limpieza previa de políticas para ejecución idempotente
DROP POLICY IF EXISTS "Perfiles: lectura del propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Clientes: lectura pública para anon y authenticated" ON public.clients;
DROP POLICY IF EXISTS "Clientes: gestión completa solo para admin" ON public.clients;

-- Política en public.profiles: Lectura propia
CREATE POLICY "Perfiles: lectura del propio perfil"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Política de lectura en public.clients: Permitir SELECT a anon y authenticated (Login bajo demanda en CUD)
CREATE POLICY "Clientes: lectura pública para anon y authenticated"
    ON public.clients
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Política de escritura (INSERT, UPDATE, DELETE) en public.clients: Solo usuarios autenticados con rol 'admin'
CREATE POLICY "Clientes: gestión completa solo para admin"
    ON public.clients
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 6. CONFIGURACIÓN DE SUPABASE STORAGE BUCKET ('gallery')
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Limpieza previa de políticas de Storage
DROP POLICY IF EXISTS "Gallery: lectura pública de imágenes" ON storage.objects;
DROP POLICY IF EXISTS "Gallery: subida para usuarios autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Gallery: borrado para usuarios autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Gallery: actualización para usuarios autenticados" ON storage.objects;

-- Lectura pública para el bucket 'gallery'
CREATE POLICY "Gallery: lectura pública de imágenes"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'gallery');

-- Subida para usuarios autenticados en el bucket 'gallery'
CREATE POLICY "Gallery: subida para usuarios autenticados"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'gallery');

-- Actualización y borrado para usuarios autenticados en el bucket 'gallery'
CREATE POLICY "Gallery: actualización para usuarios autenticados"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'gallery');

CREATE POLICY "Gallery: borrado para usuarios autenticados"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'gallery');

-- 7. DATOS DE SEMILLA (3 REGISTROS DE EJEMPLO EN PUBLIC.CLIENTS)
INSERT INTO public.clients (nombre, empresa, email)
VALUES
    ('Elena Martínez Vega', 'Nebrija Tech Solutions', 'elena.martinez@nebrijatech.es'),
    ('Carlos Mendoza Ruiz', 'CloudSystems Iberia S.L.', 'cmendoza@cloudsystems.es'),
    ('Sofía Alarcón Torres', 'Innova Data Studio', 'sofia.alarcon@innovadata.io')
ON CONFLICT (email) DO NOTHING;
