-- ============================================================
-- Migración: Doble escritura en RPCs de maestros (F0-6)
-- Fecha: 2026-04-27
-- Tarea: F0-6
-- Descripción:
--   Redefine las RPCs CRUD existentes para que, además de escribir
--   en las tablas viejas (proveedores_v2, productos_compra_v2),
--   también pueblen automáticamente las nuevas:
--     - proveedor_contactos          (contacto primario)
--     - proveedor_condiciones_pago   (condición activa)
--     - producto_formatos            (formato predeterminado)
--     - proveedor_producto_precios   (precio activo)
--
--   Las RPCs afectadas (mismas firmas, comportamiento ampliado):
--     - rpc_crear_proveedor
--     - rpc_actualizar_proveedor
--     - rpc_crear_producto_compra
--     - rpc_actualizar_producto_compra
--
--   El frontend NO necesita cambios. Sigue llamando a las mismas RPCs.
--   Cuando Horacio cargue proveedores y productos vía la pantalla actual,
--   los datos llegan al modelo nuevo automáticamente.
--
-- Rollback: 20260427180000_dual_write_rpcs_rollback.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Helpers de mapeo (idempotentes)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_parse_dias_pago(p_plazo text)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE p text := LOWER(COALESCE(p_plazo, ''));
BEGIN
  IF p IS NULL OR TRIM(p) = '' THEN RETURN 30; END IF;
  IF p LIKE '%contado%' THEN RETURN 0;  END IF;
  IF p LIKE '%90%'      THEN RETURN 90; END IF;
  IF p LIKE '%60%'      THEN RETURN 60; END IF;
  IF p LIKE '%45%'      THEN RETURN 45; END IF;
  IF p LIKE '%30%'      THEN RETURN 30; END IF;
  IF p LIKE '%15%'      THEN RETURN 15; END IF;
  IF p LIKE '%7%'       THEN RETURN 7;  END IF;
  RETURN 30;
END;
$$;

CREATE OR REPLACE FUNCTION fn_map_forma_pago(p_forma text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE p_forma
    WHEN 'SEPA'          THEN 'sepa'
    WHEN 'Transferencia' THEN 'transferencia'
    WHEN 'T. Credito'    THEN 'tarjeta_credito'
    WHEN 'Efectivo'      THEN 'efectivo'
    ELSE 'transferencia'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_map_unidad_compra(p_um text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE u text := LOWER(COALESCE(p_um, ''));
BEGIN
  RETURN CASE
    WHEN u IN ('kg','kilo','kilos','kilogramo')      THEN 'kg'
    WHEN u IN ('g','gr','gramo','gramos')            THEN 'g'
    WHEN u IN ('l','litro','litros')                 THEN 'l'
    WHEN u IN ('ml','mililitro','mililitros')        THEN 'ml'
    WHEN u IN ('caja','cajas')                       THEN 'caja'
    WHEN u IN ('pack','packs')                       THEN 'pack'
    WHEN u IN ('saco','sacos')                       THEN 'saco'
    WHEN u IN ('garrafa','garrafas')                 THEN 'garrafa'
    WHEN u IN ('palet','palets','palé')              THEN 'palet'
    WHEN u IN ('bidon','bidón','bidones')            THEN 'bidon'
    WHEN u IN ('bandeja','bandejas')                 THEN 'bandeja'
    WHEN u IN ('docena','docenas')                   THEN 'docena'
    ELSE 'ud'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_map_unidad_uso(p_um text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE u text := LOWER(COALESCE(p_um, ''));
BEGIN
  RETURN CASE
    WHEN u IN ('kg','kilo','kilos','kilogramo') THEN 'kg'
    WHEN u IN ('g','gr','gramo','gramos')       THEN 'g'
    WHEN u IN ('l','litro','litros')            THEN 'l'
    WHEN u IN ('ml','mililitro','mililitros')   THEN 'ml'
    ELSE 'ud'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION fn_map_iva_pct(p_iva text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE p_iva
    WHEN 'General 21%'      THEN 21
    WHEN 'Reducido 10%'     THEN 10
    WHEN 'Superreducido 4%' THEN 4
    WHEN 'Exento 0%'        THEN 0
    ELSE 21
  END;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Helper internos para upsert "uno activo / uno primario"
-- ────────────────────────────────────────────────────────────

-- Upsert del contacto primario de un proveedor
CREATE OR REPLACE FUNCTION fn_upsert_contacto_primario(
  p_proveedor_id integer,
  p_nombre       text,
  p_telefono     text,
  p_email        text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Si no hay datos relevantes, no hacer nada
  IF p_nombre IS NULL AND p_telefono IS NULL AND p_email IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM proveedor_contactos WHERE proveedor_id = p_proveedor_id AND es_primario = true) THEN
    UPDATE proveedor_contactos
       SET nombre   = COALESCE(NULLIF(TRIM(p_nombre), ''), nombre),
           telefono = COALESCE(NULLIF(TRIM(p_telefono), ''), telefono),
           email    = COALESCE(NULLIF(TRIM(p_email), ''), email),
           updated_at = now()
     WHERE proveedor_id = p_proveedor_id AND es_primario = true;
  ELSE
    INSERT INTO proveedor_contactos (
      proveedor_id, nombre, rol, telefono, email, es_primario, notas
    ) VALUES (
      p_proveedor_id,
      COALESCE(NULLIF(TRIM(p_nombre), ''), '(sin nombre)'),
      'general',
      NULLIF(TRIM(p_telefono), ''),
      NULLIF(TRIM(p_email), ''),
      true,
      'Generado por rpc_*_proveedor (F0-6)'
    );
  END IF;
END;
$$;

-- Upsert de la condición de pago activa de un proveedor
CREATE OR REPLACE FUNCTION fn_upsert_condicion_activa(
  p_proveedor_id integer,
  p_forma_pago   text,
  p_plazo_pago   text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_forma_pago IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM proveedor_condiciones_pago WHERE proveedor_id = p_proveedor_id AND activa = true) THEN
    UPDATE proveedor_condiciones_pago
       SET forma_pago = fn_map_forma_pago(p_forma_pago),
           dias_pago  = fn_parse_dias_pago(p_plazo_pago),
           updated_at = now()
     WHERE proveedor_id = p_proveedor_id AND activa = true;
  ELSE
    INSERT INTO proveedor_condiciones_pago (
      proveedor_id, forma_pago, dias_pago, activa, notas
    ) VALUES (
      p_proveedor_id,
      fn_map_forma_pago(p_forma_pago),
      fn_parse_dias_pago(p_plazo_pago),
      true,
      'Generado por rpc_*_proveedor (F0-6)'
    );
  END IF;
END;
$$;

-- Upsert del formato predeterminado de un producto. Devuelve el formato_id.
CREATE OR REPLACE FUNCTION fn_upsert_formato_predeterminado(
  p_producto_id          integer,
  p_unidad_medida        text,
  p_unidad_minima_compra numeric
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_formato_id uuid;
BEGIN
  SELECT id INTO v_formato_id
    FROM producto_formatos
   WHERE producto_id = p_producto_id AND es_predeterminado = true;

  IF v_formato_id IS NOT NULL THEN
    UPDATE producto_formatos SET
      formato_compra       = COALESCE(NULLIF(TRIM(p_unidad_medida), ''), formato_compra),
      unidad_compra        = fn_map_unidad_compra(p_unidad_medida),
      unidad_uso           = fn_map_unidad_uso(p_unidad_medida),
      unidades_por_paquete = COALESCE(p_unidad_minima_compra::int, unidades_por_paquete),
      updated_at           = now()
    WHERE id = v_formato_id;
  ELSE
    INSERT INTO producto_formatos (
      producto_id, formato_compra, unidad_compra, unidad_uso,
      factor_conversion, unidades_por_paquete, es_predeterminado, notas
    ) VALUES (
      p_producto_id,
      COALESCE(NULLIF(TRIM(p_unidad_medida), ''), 'Unidad'),
      fn_map_unidad_compra(p_unidad_medida),
      fn_map_unidad_uso(p_unidad_medida),
      1.0,
      CASE WHEN p_unidad_minima_compra IS NOT NULL AND p_unidad_minima_compra > 0
           THEN p_unidad_minima_compra::int ELSE NULL END,
      true,
      'Generado por rpc_*_producto_compra (F0-6) — REVISAR factor_conversion'
    ) RETURNING id INTO v_formato_id;
  END IF;

  RETURN v_formato_id;
END;
$$;

-- Upsert del precio activo proveedor+formato
CREATE OR REPLACE FUNCTION fn_upsert_precio_activo(
  p_proveedor_id           integer,
  p_formato_id             uuid,
  p_precio                 numeric,
  p_tipo_iva               text,
  p_cantidad_minima_pedido numeric
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_proveedor_id IS NULL OR p_formato_id IS NULL OR p_precio IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM proveedor_producto_precios
     WHERE proveedor_id = p_proveedor_id AND formato_id = p_formato_id AND activa = true
  ) THEN
    UPDATE proveedor_producto_precios SET
      precio                 = p_precio,
      iva_pct                = fn_map_iva_pct(p_tipo_iva),
      cantidad_minima_pedido = COALESCE(p_cantidad_minima_pedido, cantidad_minima_pedido),
      updated_at             = now()
    WHERE proveedor_id = p_proveedor_id AND formato_id = p_formato_id AND activa = true;
  ELSE
    INSERT INTO proveedor_producto_precios (
      proveedor_id, formato_id, precio, iva_pct, cantidad_minima_pedido,
      vigente_desde, activa, notas
    ) VALUES (
      p_proveedor_id, p_formato_id, p_precio, fn_map_iva_pct(p_tipo_iva),
      p_cantidad_minima_pedido,
      CURRENT_DATE, true,
      'Generado por rpc_*_producto_compra (F0-6)'
    );
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 1. rpc_crear_proveedor — añadir doble escritura
-- ────────────────────────────────────────────────────────────
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

    -- Doble escritura: poblar tablas nuevas
    PERFORM fn_upsert_contacto_primario(v_id, p_persona_contacto, p_telefono_contacto, p_mail_contacto);
    PERFORM fn_upsert_condicion_activa(v_id, p_forma_pago, p_plazo_pago);

    RETURN json_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'CIF ya existe');
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. rpc_actualizar_proveedor — añadir doble escritura
-- ────────────────────────────────────────────────────────────
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

    -- Doble escritura sobre tablas nuevas (con el estado final ya en proveedores_v2)
    PERFORM fn_upsert_contacto_primario(
      p_id,
      (SELECT persona_contacto  FROM proveedores_v2 WHERE id = p_id),
      (SELECT telefono_contacto FROM proveedores_v2 WHERE id = p_id),
      (SELECT mail_contacto     FROM proveedores_v2 WHERE id = p_id)
    );
    PERFORM fn_upsert_condicion_activa(
      p_id,
      (SELECT forma_pago FROM proveedores_v2 WHERE id = p_id),
      (SELECT plazo_pago FROM proveedores_v2 WHERE id = p_id)
    );

    RETURN json_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'CIF ya existe');
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. rpc_crear_producto_compra — añadir doble escritura
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_crear_producto_compra(
    p_nombre text,
    p_proveedor_id integer DEFAULT NULL,
    p_cod_proveedor text DEFAULT NULL,
    p_cod_interno text DEFAULT NULL,
    p_medidas text DEFAULT NULL,
    p_color text DEFAULT NULL,
    p_unidad_medida text DEFAULT NULL,
    p_unidad_minima_compra numeric DEFAULT NULL,
    p_dia_pedido text DEFAULT NULL,
    p_dia_entrega text DEFAULT NULL,
    p_precio numeric DEFAULT NULL,
    p_tipo_iva text DEFAULT NULL,
    p_forma_pago text DEFAULT NULL,
    p_plazo_pago text DEFAULT NULL,
    p_producto_venta_id integer DEFAULT NULL,
    p_stock_minimo numeric DEFAULT 0
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
    v_id        integer;
    v_forma     text;
    v_plazo     text;
    v_formato_id uuid;
BEGIN
    -- Heredar forma/plazo del proveedor si no se especifica
    IF p_forma_pago IS NULL AND p_proveedor_id IS NOT NULL THEN
        SELECT forma_pago, plazo_pago INTO v_forma, v_plazo
        FROM proveedores_v2 WHERE id = p_proveedor_id;
        p_forma_pago := v_forma;
        p_plazo_pago := COALESCE(p_plazo_pago, v_plazo);
    END IF;

    INSERT INTO productos_compra_v2 (
        nombre, proveedor_id, cod_proveedor, cod_interno,
        medidas, color, unidad_medida, unidad_minima_compra,
        dia_pedido, dia_entrega, precio, tipo_iva,
        forma_pago, plazo_pago, producto_venta_id, stock_minimo
    ) VALUES (
        p_nombre, p_proveedor_id, p_cod_proveedor, p_cod_interno,
        p_medidas, p_color, p_unidad_medida, p_unidad_minima_compra,
        p_dia_pedido, p_dia_entrega, p_precio, p_tipo_iva,
        p_forma_pago, p_plazo_pago, p_producto_venta_id, p_stock_minimo
    )
    RETURNING id INTO v_id;

    -- Doble escritura: formato predeterminado y precio
    v_formato_id := fn_upsert_formato_predeterminado(v_id, p_unidad_medida, p_unidad_minima_compra);
    PERFORM fn_upsert_precio_activo(p_proveedor_id, v_formato_id, p_precio, p_tipo_iva, p_unidad_minima_compra);

    RETURN json_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'Código interno ya existe');
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. rpc_actualizar_producto_compra — añadir doble escritura
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_actualizar_producto_compra(
    p_id integer,
    p_nombre text DEFAULT NULL,
    p_proveedor_id integer DEFAULT NULL,
    p_cod_proveedor text DEFAULT NULL,
    p_cod_interno text DEFAULT NULL,
    p_medidas text DEFAULT NULL,
    p_color text DEFAULT NULL,
    p_unidad_medida text DEFAULT NULL,
    p_unidad_minima_compra numeric DEFAULT NULL,
    p_dia_pedido text DEFAULT NULL,
    p_dia_entrega text DEFAULT NULL,
    p_precio numeric DEFAULT NULL,
    p_tipo_iva text DEFAULT NULL,
    p_forma_pago text DEFAULT NULL,
    p_plazo_pago text DEFAULT NULL,
    p_producto_venta_id integer DEFAULT NULL,
    p_stock_minimo numeric DEFAULT NULL,
    p_activo boolean DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
    v_formato_id  uuid;
    v_proveedor_id integer;
    v_unidad_medida text;
    v_unidad_minima_compra numeric;
    v_precio       numeric;
    v_tipo_iva     text;
BEGIN
    UPDATE productos_compra_v2 SET
        nombre              = COALESCE(p_nombre, nombre),
        proveedor_id        = COALESCE(p_proveedor_id, proveedor_id),
        cod_proveedor       = COALESCE(p_cod_proveedor, cod_proveedor),
        cod_interno         = COALESCE(p_cod_interno, cod_interno),
        medidas             = COALESCE(p_medidas, medidas),
        color               = COALESCE(p_color, color),
        unidad_medida       = COALESCE(p_unidad_medida, unidad_medida),
        unidad_minima_compra = COALESCE(p_unidad_minima_compra, unidad_minima_compra),
        dia_pedido          = COALESCE(p_dia_pedido, dia_pedido),
        dia_entrega         = COALESCE(p_dia_entrega, dia_entrega),
        precio              = COALESCE(p_precio, precio),
        tipo_iva            = COALESCE(p_tipo_iva, tipo_iva),
        forma_pago          = COALESCE(p_forma_pago, forma_pago),
        plazo_pago          = COALESCE(p_plazo_pago, plazo_pago),
        producto_venta_id   = COALESCE(p_producto_venta_id, producto_venta_id),
        stock_minimo        = COALESCE(p_stock_minimo, stock_minimo),
        activo              = COALESCE(p_activo, activo)
    WHERE id = p_id;

    -- Leer estado final para sincronizar
    SELECT proveedor_id, unidad_medida, unidad_minima_compra, precio, tipo_iva
      INTO v_proveedor_id, v_unidad_medida, v_unidad_minima_compra, v_precio, v_tipo_iva
      FROM productos_compra_v2 WHERE id = p_id;

    v_formato_id := fn_upsert_formato_predeterminado(p_id, v_unidad_medida, v_unidad_minima_compra);
    PERFORM fn_upsert_precio_activo(v_proveedor_id, v_formato_id, v_precio, v_tipo_iva, v_unidad_minima_compra);

    RETURN json_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'Código interno ya existe');
END;
$$;

-- ============================================================
-- FIN MIGRACIÓN F0-6
-- ============================================================
