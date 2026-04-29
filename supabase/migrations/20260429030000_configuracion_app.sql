-- ============================================================
-- Back office: tabla configuración general de la app
-- (separada de configuracion_compras para no mezclar conceptos)
-- ============================================================

CREATE TABLE IF NOT EXISTS configuracion_app (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave         text NOT NULL UNIQUE,
  valor         jsonb NOT NULL DEFAULT '""'::jsonb,
  categoria     text NOT NULL DEFAULT 'general',
  etiqueta      text NOT NULL,
  descripcion   text,
  tipo          text NOT NULL DEFAULT 'text' CHECK (tipo IN ('text','textarea','color','number','email','url','emoji','select','boolean')),
  opciones      jsonb,             -- para tipo='select', array de strings
  orden         int  NOT NULL DEFAULT 100,
  editable      boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);

DROP TRIGGER IF EXISTS tg_config_app_updated_at ON configuracion_app;
CREATE TRIGGER tg_config_app_updated_at
  BEFORE UPDATE ON configuracion_app
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

ALTER TABLE configuracion_app ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_app_select" ON configuracion_app;
CREATE POLICY "config_app_select" ON configuracion_app FOR SELECT USING (true);
DROP POLICY IF EXISTS "config_app_modify" ON configuracion_app;
CREATE POLICY "config_app_modify" ON configuracion_app FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Sembrar valores por defecto (idempotente)
INSERT INTO configuracion_app (clave, valor, categoria, etiqueta, descripcion, tipo, orden) VALUES
  ('app_nombre',           '"Tío Bigotes"'::jsonb,        'branding', 'Nombre de la app',
   'Nombre comercial que aparece arriba a la izquierda de la app', 'text', 10),
  ('app_subtitulo',        '"Pro Dashboard"'::jsonb,       'branding', 'Subtítulo / claim',
   'Texto pequeño que aparece bajo el nombre', 'text', 20),
  ('app_logo_texto',       '"TB"'::jsonb,                  'branding', 'Logo (texto/emoji)',
   'Letras o emoji que aparecen en el cuadrado del logo. Ej: "TB", "🥟", "TB🔥"', 'emoji', 30),
  ('app_color_primario',   '"#1e40af"'::jsonb,             'branding', 'Color primario',
   'Color principal del header de emails y partes destacadas (formato hex)', 'color', 40),
  ('app_color_sidebar',    '"#0f172a"'::jsonb,             'branding', 'Color del sidebar',
   'Color de fondo del menú lateral (formato hex)', 'color', 50),
  ('app_eslogan_email',    '"Tío Bigotes · Pro"'::jsonb,   'branding', 'Cabecera de los emails',
   'Texto pequeño en mayúsculas que aparece arriba en los emails (pedidos, incidencias, bienvenida)', 'text', 60),
  ('email_from_nombre',    '"Tío Bigotes"'::jsonb,         'email',    'Nombre del remitente',
   'Nombre que verán los proveedores al recibir tus emails. Ej: "Tío Bigotes" → "Tío Bigotes <pedidos@sebbrofoods.com>"', 'text', 10),
  ('email_from_address',   '"pedidos@sebbrofoods.com"'::jsonb, 'email', 'Email remitente',
   'Dirección desde la que salen los emails. Debe estar verificada en Resend.', 'email', 20),
  ('email_reply_to',       '""'::jsonb,                    'email',    'Email para respuestas (opcional)',
   'Si los proveedores responden al email, llegará aquí. Dejar vacío si no quieres recibir respuestas.', 'email', 30),
  ('app_url',              '"https://app.sebbrofoods.com"'::jsonb, 'general', 'URL pública de la app',
   'URL principal de la app, usada en los emails como botón "Acceder"', 'url', 10),
  ('soporte_email',        '"horaciobroggi@gmail.com"'::jsonb, 'general', 'Email de soporte',
   'Para que los empleados sepan a quién contactar si tienen problemas', 'email', 20),
  ('texto_bienvenida',     '"¡Hola! [nombre], Tu perfil ya está activo en la aplicación. Desde aquí podrás consultar la información necesaria para tu día a día y ayudarnos a trabajar mejor como equipo."'::jsonb,
   'email', 'Texto de bienvenida',
   'Mensaje que aparece en el email enviado a un nuevo empleado. Usa [nombre] como placeholder.', 'textarea', 40)
ON CONFLICT (clave) DO NOTHING;

-- RPC actualizar
CREATE OR REPLACE FUNCTION rpc_actualizar_configuracion(p_clave text, p_valor jsonb)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE v_editable boolean;
BEGIN
  SELECT editable INTO v_editable FROM configuracion_app WHERE clave = p_clave;
  IF v_editable IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrada');
  END IF;
  IF NOT v_editable THEN
    RETURN json_build_object('ok', false, 'error', 'no_editable');
  END IF;
  UPDATE configuracion_app SET valor = p_valor, updated_at = now(), updated_by = auth.uid()
   WHERE clave = p_clave;
  RETURN json_build_object('ok', true);
END;
$$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='configuracion_app') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE configuracion_app';
  END IF;
END $$;
