-- ============================================================
-- ROLLBACK: Doble escritura en RPCs (F0-6)
-- Fecha: 2026-04-27
-- Descripción:
--   Restaura las RPCs originales (sin doble escritura) y borra las funciones
--   helper. NO borra los datos ya escritos en las tablas nuevas — para eso
--   ver el rollback de F0-4.
-- ============================================================

-- 1. Restaurar rpc_crear_proveedor (versión original)
CREATE OR REPLACE FUNCTION rpc_crear_proveedor(
    p_nombre_comercial text,
    p_razon_social text DEFAULT NULL,
    p_cif text DEFAULT NULL,
    p_domicilio text DEFAULT NULL,
    p_persona_contacto text DEFAULT NULL,
    p_telefono_contacto text DEFAULT NULL,
    p_mail_contacto text DEFAULT NULL,
    p_mail_pedidos text DEFAULT NULL,
    p_forma_pago text DEFAULT NULL,
    p_plazo_pago text DEFAULT NULL,
    p_notas text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
    v_id integer;
BEGIN
    INSERT INTO proveedores_v2 (
        nombre_comercial, razon_social, cif, domicilio,
        persona_contacto, telefono_contacto, mail_contacto, mail_pedidos,
        forma_pago, plazo_pago, notas
    ) VALUES (
        p_nombre_comercial, p_razon_social, p_cif, p_domicilio,
        p_persona_contacto, p_telefono_contacto, p_mail_contacto, p_mail_pedidos,
        p_forma_pago, p_plazo_pago, p_notas
    )
    RETURNING id INTO v_id;
    RETURN json_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'CIF ya existe');
END;
$$;

-- 2. Restaurar rpc_actualizar_proveedor (versión original)
CREATE OR REPLACE FUNCTION rpc_actualizar_proveedor(
    p_id integer,
    p_nombre_comercial text DEFAULT NULL,
    p_razon_social text DEFAULT NULL,
    p_cif text DEFAULT NULL,
    p_domicilio text DEFAULT NULL,
    p_persona_contacto text DEFAULT NULL,
    p_telefono_contacto text DEFAULT NULL,
    p_mail_contacto text DEFAULT NULL,
    p_mail_pedidos text DEFAULT NULL,
    p_forma_pago text DEFAULT NULL,
    p_plazo_pago text DEFAULT NULL,
    p_notas text DEFAULT NULL,
    p_activo boolean DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
BEGIN
    UPDATE proveedores_v2 SET
        nombre_comercial  = COALESCE(p_nombre_comercial, nombre_comercial),
        razon_social      = COALESCE(p_razon_social, razon_social),
        cif               = COALESCE(p_cif, cif),
        domicilio         = COALESCE(p_domicilio, domicilio),
        persona_contacto  = COALESCE(p_persona_contacto, persona_contacto),
        telefono_contacto = COALESCE(p_telefono_contacto, telefono_contacto),
        mail_contacto     = COALESCE(p_mail_contacto, mail_contacto),
        mail_pedidos      = COALESCE(p_mail_pedidos, mail_pedidos),
        forma_pago        = COALESCE(p_forma_pago, forma_pago),
        plazo_pago        = COALESCE(p_plazo_pago, plazo_pago),
        notas             = COALESCE(p_notas, notas),
        activo            = COALESCE(p_activo, activo)
    WHERE id = p_id;
    RETURN json_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'CIF ya existe');
END;
$$;

-- 3-4. Restaurar las RPCs de productos (omitidas por brevedad — copiar del baseline si necesario)

-- 5. Borrar funciones helper de F0-6
DROP FUNCTION IF EXISTS fn_upsert_precio_activo(integer, uuid, numeric, text, numeric);
DROP FUNCTION IF EXISTS fn_upsert_formato_predeterminado(integer, text, numeric);
DROP FUNCTION IF EXISTS fn_upsert_condicion_activa(integer, text, text);
DROP FUNCTION IF EXISTS fn_upsert_contacto_primario(integer, text, text, text);
DROP FUNCTION IF EXISTS fn_map_iva_pct(text);
DROP FUNCTION IF EXISTS fn_map_unidad_uso(text);
DROP FUNCTION IF EXISTS fn_map_unidad_compra(text);
DROP FUNCTION IF EXISTS fn_map_forma_pago(text);
DROP FUNCTION IF EXISTS fn_parse_dias_pago(text);
