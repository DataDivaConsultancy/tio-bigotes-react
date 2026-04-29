-- ============================================================
-- Refactor de roles: usar tabla existente tb_v2.roles_v2 ampliada
-- ============================================================

-- 1. Ampliar tabla existente
ALTER TABLE tb_v2.roles_v2 ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE tb_v2.roles_v2 ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE tb_v2.roles_v2 ADD COLUMN IF NOT EXISTS es_sistema boolean NOT NULL DEFAULT false;
ALTER TABLE tb_v2.roles_v2 ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- Marcar superadmin como sistema
UPDATE tb_v2.roles_v2 SET es_sistema = true WHERE rol = 'superadmin';

-- Asegurar id no nulo
UPDATE tb_v2.roles_v2 SET id = gen_random_uuid() WHERE id IS NULL;

-- Sembrar los roles del PRD si no existen
INSERT INTO tb_v2.roles_v2 (rol, descripcion, permisos, es_sistema, activo)
VALUES
  ('encargado_tienda', 'Encargado de un local. Crea pedidos y recepciona mercancía.',
   '["ComprasDashboard","Pedidos","Recepciones","Incidencias","Stock","Operativa","Forecast"]'::jsonb, false, true),
  ('responsable_operaciones', 'Operaciones: aprueba pedidos, gestiona catálogo y proveedores.',
   '["ComprasDashboard","Pedidos","Recepciones","Incidencias","Stock","Proveedores","ProductosCompra","Locales","Forecast","BI","Operativa"]'::jsonb, false, true),
  ('direccion_financiera', 'Dirección financiera: aprueba facturas, presupuestos.',
   '["ComprasDashboard","Pedidos","Recepciones","Incidencias","BI","Auditoria","Proveedores","ProductosCompra","Stock"]'::jsonb, false, true),
  ('administrador_cuenta', 'Administrador de la cuenta: configura el sistema, importa datos.',
   '["ComprasDashboard","Pedidos","Recepciones","Incidencias","Proveedores","ProductosCompra","Locales","Stock","Empleados","Roles","CargaVentas","CargaProductos","Auditoria","BI","Operativa","Forecast","Pendientes"]'::jsonb, false, true)
ON CONFLICT (rol) DO NOTHING;

-- 2. Reemplazar la vista public.roles_v2 con todos los campos
DROP VIEW IF EXISTS public.roles_v2 CASCADE;
CREATE VIEW public.roles_v2 AS
SELECT id, rol AS nombre, descripcion, permisos, es_sistema, activo, created_at, updated_at
FROM tb_v2.roles_v2;

-- 3. RPCs con SECURITY DEFINER para tocar tb_v2.roles_v2 desde public
CREATE OR REPLACE FUNCTION rpc_crear_rol(
  p_nombre text, p_descripcion text DEFAULT NULL, p_permisos jsonb DEFAULT '[]'::jsonb
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tb_v2 AS $$
DECLARE v_id uuid;
BEGIN
  IF p_nombre IS NULL OR TRIM(p_nombre) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'falta_nombre');
  END IF;
  INSERT INTO tb_v2.roles_v2 (rol, descripcion, permisos, es_sistema, activo)
  VALUES (TRIM(p_nombre), p_descripcion, COALESCE(p_permisos, '[]'::jsonb), false, true)
  RETURNING id INTO v_id;
  RETURN json_build_object('ok', true, 'data', json_build_object('id', v_id));
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('ok', false, 'error', 'ya_existe', 'mensaje', 'Ya existe un rol con ese nombre');
END;
$$;

CREATE OR REPLACE FUNCTION rpc_actualizar_rol(
  p_id uuid, p_nombre text DEFAULT NULL, p_descripcion text DEFAULT NULL,
  p_permisos jsonb DEFAULT NULL, p_activo boolean DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tb_v2 AS $$
DECLARE v_es_sistema boolean; v_old_nombre text;
BEGIN
  SELECT es_sistema, rol INTO v_es_sistema, v_old_nombre FROM tb_v2.roles_v2 WHERE id = p_id;
  IF v_es_sistema IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF v_es_sistema AND p_nombre IS NOT NULL AND TRIM(p_nombre) <> v_old_nombre THEN
    RETURN json_build_object('ok', false, 'error', 'rol_sistema_protegido', 'mensaje', 'No se puede renombrar un rol del sistema');
  END IF;
  UPDATE tb_v2.roles_v2 SET
    rol         = COALESCE(NULLIF(TRIM(p_nombre), ''), rol),
    descripcion = COALESCE(p_descripcion, descripcion),
    permisos    = COALESCE(p_permisos, permisos),
    activo      = COALESCE(p_activo, activo)
  WHERE id = p_id;
  -- Si cambió el nombre, propagarlo a empleados que usaban el viejo
  IF p_nombre IS NOT NULL AND TRIM(p_nombre) <> v_old_nombre THEN
    UPDATE empleados_v2 SET rol = TRIM(p_nombre) WHERE rol = v_old_nombre;
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_eliminar_rol(p_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tb_v2 AS $$
DECLARE v_nombre text; v_es_sistema boolean; v_uso int;
BEGIN
  SELECT rol, es_sistema INTO v_nombre, v_es_sistema FROM tb_v2.roles_v2 WHERE id = p_id;
  IF v_nombre IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF v_es_sistema THEN
    RETURN json_build_object('ok', false, 'error', 'rol_sistema_protegido');
  END IF;
  SELECT COUNT(*) INTO v_uso FROM empleados_v2 WHERE rol = v_nombre AND COALESCE(activo, false) = true;
  IF v_uso > 0 THEN
    RETURN json_build_object('ok', false, 'error', 'rol_en_uso',
      'mensaje', format('No se puede eliminar: %s empleado(s) activo(s) usan este rol', v_uso));
  END IF;
  DELETE FROM tb_v2.roles_v2 WHERE id = p_id;
  RETURN json_build_object('ok', true);
END;
$$;

-- 4. Vista para login: empleado + permisos efectivos del rol
CREATE OR REPLACE VIEW v_empleado_con_permisos AS
SELECT
  e.id, e.nombre, e.email, e.telefono, e.rol, e.activo,
  e.must_change_password, e.local_id, e.codigo_pos,
  COALESCE(r.permisos, e.permisos, '[]'::jsonb) AS permisos_efectivos
FROM empleados_v2 e
LEFT JOIN tb_v2.roles_v2 r ON r.rol = e.rol AND r.activo = true;
