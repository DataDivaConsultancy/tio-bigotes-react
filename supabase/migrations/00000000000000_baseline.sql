-- ============================================================
-- MIGRACIÓN BASELINE — Estado del schema antes del módulo de compras v2
-- Generada: 2026-04-27
-- ============================================================
-- Esta migración refleja el estado actual de la BD en producción.
-- NO ejecutar en producción (las tablas ya existen).
-- Sí ejecutar en entornos NUEVOS (dev/staging) para reproducir el schema.
-- Todas las sentencias usan IF NOT EXISTS para ser idempotentes.
-- ============================================================

-- ============================================================
-- MÓDULO DE COMPRAS — Tío Bigotes
-- Esquema SQL para Supabase (PostgreSQL)
-- Ejecutar en orden en el SQL Editor de Supabase
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLA: proveedores_v2
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores_v2 (
    id              serial PRIMARY KEY,
    nombre_comercial text NOT NULL,
    razon_social    text,
    cif             text UNIQUE,
    domicilio       text,
    persona_contacto text,
    telefono_contacto text,
    mail_contacto   text,
    mail_pedidos    text,           -- Email específico para enviar pedidos
    forma_pago      text CHECK (forma_pago IN ('SEPA','Transferencia','T. Credito','Efectivo')),
    plazo_pago      text,           -- Ej: "30 días", "contado"
    notas           text,
    activo          boolean DEFAULT true,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. TABLA: locales_compra_v2
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locales_compra_v2 (
    id          serial PRIMARY KEY,
    nombre      text NOT NULL,
    direccion   text,
    telefono    text,
    transporte  text,               -- Ej: "Furgoneta propia", "Mensajería"
    activo      boolean DEFAULT true,
    created_at  timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 3. TABLA: productos_compra_v2
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos_compra_v2 (
    id                  serial PRIMARY KEY,
    cod_proveedor       text,
    cod_interno         text UNIQUE,
    nombre              text NOT NULL,
    medidas             text,
    color               text,
    unidad_medida       text,           -- kg, unidad, litro, caja...
    unidad_minima_compra numeric,
    dia_pedido          text,           -- "Lunes", "Lunes,Miércoles"
    dia_entrega         text,           -- "Martes", "Martes,Jueves"
    proveedor_id        integer REFERENCES proveedores_v2(id),
    precio              numeric(10,2),
    tipo_iva            text CHECK (tipo_iva IN ('General 21%','Reducido 10%','Superreducido 4%','Exento 0%')),
    forma_pago          text CHECK (forma_pago IN ('SEPA','Transferencia','T. Credito','Efectivo')),
    plazo_pago          text,
    producto_venta_id   integer,        -- FK opcional a productos de venta
    stock_minimo        numeric DEFAULT 0,
    activo              boolean DEFAULT true,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_compra_proveedor ON productos_compra_v2(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_productos_compra_activo ON productos_compra_v2(activo);

-- ────────────────────────────────────────────────────────────
-- 4. TABLA: campos_extra_producto_v2
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campos_extra_producto_v2 (
    id                  serial PRIMARY KEY,
    producto_compra_id  integer NOT NULL REFERENCES productos_compra_v2(id) ON DELETE CASCADE,
    campo               text NOT NULL,
    valor               text
);

CREATE INDEX IF NOT EXISTS idx_campos_extra_producto ON campos_extra_producto_v2(producto_compra_id);

-- ────────────────────────────────────────────────────────────
-- 5. TABLA: stock_movimientos_v2
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movimientos_v2 (
    id                  serial PRIMARY KEY,
    producto_compra_id  integer NOT NULL REFERENCES productos_compra_v2(id),
    local_id            integer NOT NULL REFERENCES locales_compra_v2(id),
    tipo                text NOT NULL CHECK (tipo IN (
                            'entrada','salida',
                            'ajuste_positivo','ajuste_negativo',
                            'merma','venta_auto',
                            'traspaso_entrada','traspaso_salida'
                        )),
    cantidad            numeric NOT NULL CHECK (cantidad > 0),
    motivo              text,
    fecha               date NOT NULL DEFAULT CURRENT_DATE,
    usuario_id          integer,
    local_destino_id    integer REFERENCES locales_compra_v2(id),  -- Solo para traspasos
    created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_mov_producto ON stock_movimientos_v2(producto_compra_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_local ON stock_movimientos_v2(local_id);
CREATE INDEX IF NOT EXISTS idx_stock_mov_fecha ON stock_movimientos_v2(fecha);

-- ────────────────────────────────────────────────────────────
-- 6. VISTA: vw_stock_actual
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_stock_actual AS
SELECT
    sm.producto_compra_id,
    sm.local_id,
    pc.nombre            AS producto_nombre,
    pc.cod_interno,
    pc.unidad_medida,
    pc.stock_minimo,
    pc.precio,
    pc.dia_pedido,
    pc.dia_entrega,
    pc.producto_venta_id,
    pv.nombre_comercial  AS proveedor_nombre,
    pc.proveedor_id,
    lc.nombre            AS local_nombre,
    SUM(CASE
        WHEN sm.tipo IN ('entrada','ajuste_positivo','traspaso_entrada') THEN sm.cantidad
        ELSE -sm.cantidad
    END) AS stock_actual,
    MAX(sm.fecha)        AS ultimo_movimiento
FROM stock_movimientos_v2 sm
JOIN productos_compra_v2 pc ON pc.id = sm.producto_compra_id
LEFT JOIN proveedores_v2 pv ON pv.id = pc.proveedor_id
LEFT JOIN locales_compra_v2 lc ON lc.id = sm.local_id
WHERE pc.activo = true
GROUP BY sm.producto_compra_id, sm.local_id,
         pc.nombre, pc.cod_interno, pc.unidad_medida,
         pc.stock_minimo, pc.precio, pc.dia_pedido, pc.dia_entrega,
         pc.producto_venta_id, pv.nombre_comercial, pc.proveedor_id,
         lc.nombre;

-- ────────────────────────────────────────────────────────────
-- 7. TRIGGER: updated_at automático
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proveedores_updated ON proveedores_v2;
CREATE TRIGGER trg_proveedores_updated
    BEFORE UPDATE ON proveedores_v2
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_productos_compra_updated ON productos_compra_v2;
CREATE TRIGGER trg_productos_compra_updated
    BEFORE UPDATE ON productos_compra_v2
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 8. RPCs: CRUD Proveedores
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
RETURNS json AS $$
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
$$ LANGUAGE plpgsql;

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
RETURNS json AS $$
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
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 9. RPCs: CRUD Productos Compra
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
RETURNS json AS $$
DECLARE
    v_id integer;
    v_forma text;
    v_plazo text;
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

    RETURN json_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'Código interno ya existe');
END;
$$ LANGUAGE plpgsql;

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
RETURNS json AS $$
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

    RETURN json_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'Código interno ya existe');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 10. RPCs: CRUD Locales
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_crear_local_compra(
    p_nombre text,
    p_direccion text DEFAULT NULL,
    p_telefono text DEFAULT NULL,
    p_transporte text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_id integer;
BEGIN
    INSERT INTO locales_compra_v2 (nombre, direccion, telefono, transporte)
    VALUES (p_nombre, p_direccion, p_telefono, p_transporte)
    RETURNING id INTO v_id;

    RETURN json_build_object('ok', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rpc_actualizar_local_compra(
    p_id integer,
    p_nombre text DEFAULT NULL,
    p_direccion text DEFAULT NULL,
    p_telefono text DEFAULT NULL,
    p_transporte text DEFAULT NULL,
    p_activo boolean DEFAULT NULL
)
RETURNS json AS $$
BEGIN
    UPDATE locales_compra_v2 SET
        nombre    = COALESCE(p_nombre, nombre),
        direccion = COALESCE(p_direccion, direccion),
        telefono  = COALESCE(p_telefono, telefono),
        transporte = COALESCE(p_transporte, transporte),
        activo    = COALESCE(p_activo, activo)
    WHERE id = p_id;

    RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 11. RPCs: Stock - Registrar movimiento
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_registrar_movimiento_stock(
    p_producto_compra_id integer,
    p_local_id integer,
    p_tipo text,
    p_cantidad numeric,
    p_motivo text DEFAULT NULL,
    p_fecha date DEFAULT CURRENT_DATE,
    p_usuario_id integer DEFAULT NULL,
    p_local_destino_id integer DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_id integer;
BEGIN
    INSERT INTO stock_movimientos_v2 (
        producto_compra_id, local_id, tipo, cantidad,
        motivo, fecha, usuario_id, local_destino_id
    ) VALUES (
        p_producto_compra_id, p_local_id, p_tipo, p_cantidad,
        p_motivo, p_fecha, p_usuario_id, p_local_destino_id
    )
    RETURNING id INTO v_id;

    RETURN json_build_object('ok', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 12. RPCs: Stock - Traspaso entre locales (2 movimientos)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_traspaso_stock(
    p_producto_compra_id integer,
    p_local_origen_id integer,
    p_local_destino_id integer,
    p_cantidad numeric,
    p_motivo text DEFAULT NULL,
    p_fecha date DEFAULT CURRENT_DATE,
    p_usuario_id integer DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_id_salida integer;
    v_id_entrada integer;
    v_ref text;
BEGIN
    v_ref := COALESCE(p_motivo, 'Traspaso');

    -- Movimiento de salida en origen
    INSERT INTO stock_movimientos_v2 (
        producto_compra_id, local_id, tipo, cantidad,
        motivo, fecha, usuario_id, local_destino_id
    ) VALUES (
        p_producto_compra_id, p_local_origen_id, 'traspaso_salida', p_cantidad,
        v_ref, p_fecha, p_usuario_id, p_local_destino_id
    ) RETURNING id INTO v_id_salida;

    -- Movimiento de entrada en destino
    INSERT INTO stock_movimientos_v2 (
        producto_compra_id, local_id, tipo, cantidad,
        motivo, fecha, usuario_id, local_destino_id
    ) VALUES (
        p_producto_compra_id, p_local_destino_id, 'traspaso_entrada', p_cantidad,
        v_ref, p_fecha, p_usuario_id, p_local_origen_id
    ) RETURNING id INTO v_id_entrada;

    RETURN json_build_object('ok', true, 'id_salida', v_id_salida, 'id_entrada', v_id_entrada);
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 13. RPCs: Stock - Regularización masiva
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_regularizar_stock(
    p_ajustes json,      -- Array de {producto_compra_id, local_id, conteo_real, motivo}
    p_usuario_id integer DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    v_item json;
    v_pid integer;
    v_lid integer;
    v_conteo numeric;
    v_motivo text;
    v_stock_actual numeric;
    v_diff numeric;
    v_count integer := 0;
BEGIN
    FOR v_item IN SELECT * FROM json_array_elements(p_ajustes)
    LOOP
        v_pid    := (v_item->>'producto_compra_id')::integer;
        v_lid    := (v_item->>'local_id')::integer;
        v_conteo := (v_item->>'conteo_real')::numeric;
        v_motivo := COALESCE(v_item->>'motivo', 'Regularización');

        -- Calcular stock actual
        SELECT COALESCE(SUM(CASE
            WHEN tipo IN ('entrada','ajuste_positivo','traspaso_entrada') THEN cantidad
            ELSE -cantidad
        END), 0) INTO v_stock_actual
        FROM stock_movimientos_v2
        WHERE producto_compra_id = v_pid AND local_id = v_lid;

        v_diff := v_conteo - v_stock_actual;

        IF v_diff != 0 THEN
            INSERT INTO stock_movimientos_v2 (
                producto_compra_id, local_id, tipo, cantidad,
                motivo, fecha, usuario_id
            ) VALUES (
                v_pid, v_lid,
                CASE WHEN v_diff > 0 THEN 'ajuste_positivo' ELSE 'ajuste_negativo' END,
                ABS(v_diff),
                v_motivo, CURRENT_DATE, p_usuario_id
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN json_build_object('ok', true, 'ajustes_aplicados', v_count);
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 14. RPCs: Importar productos desde CSV (batch upsert)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_upsert_productos_compra_batch(
    p_rows json  -- Array de objetos con campos del producto
)
RETURNS json AS $$
DECLARE
    v_item json;
    v_inserted integer := 0;
    v_updated integer := 0;
    v_prov_id integer;
BEGIN
    FOR v_item IN SELECT * FROM json_array_elements(p_rows)
    LOOP
        -- Buscar proveedor por nombre si viene
        IF v_item->>'proveedor' IS NOT NULL THEN
            SELECT id INTO v_prov_id FROM proveedores_v2
            WHERE lower(nombre_comercial) = lower(v_item->>'proveedor')
            AND activo = true LIMIT 1;
        ELSE
            v_prov_id := NULL;
        END IF;

        INSERT INTO productos_compra_v2 (
            cod_proveedor, cod_interno, nombre, medidas, color,
            unidad_medida, unidad_minima_compra,
            dia_pedido, dia_entrega, proveedor_id,
            precio, tipo_iva
        ) VALUES (
            v_item->>'cod_proveedor',
            v_item->>'cod_interno',
            v_item->>'nombre',
            v_item->>'medidas',
            v_item->>'color',
            v_item->>'unidad_medida',
            (v_item->>'unidad_minima_compra')::numeric,
            v_item->>'dia_pedido',
            v_item->>'dia_entrega',
            v_prov_id,
            (v_item->>'precio')::numeric,
            v_item->>'tipo_iva'
        )
        ON CONFLICT (cod_interno) DO UPDATE SET
            cod_proveedor       = EXCLUDED.cod_proveedor,
            nombre              = EXCLUDED.nombre,
            medidas             = EXCLUDED.medidas,
            color               = EXCLUDED.color,
            unidad_medida       = EXCLUDED.unidad_medida,
            unidad_minima_compra = EXCLUDED.unidad_minima_compra,
            dia_pedido          = EXCLUDED.dia_pedido,
            dia_entrega         = EXCLUDED.dia_entrega,
            proveedor_id        = COALESCE(EXCLUDED.proveedor_id, productos_compra_v2.proveedor_id),
            precio              = EXCLUDED.precio,
            tipo_iva            = EXCLUDED.tipo_iva;

        IF FOUND THEN
            -- Check if it was insert or update via xmax
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN json_build_object('ok', true, 'procesados', v_inserted);
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 15. Habilitar RLS (Row Level Security) básico
-- ────────────────────────────────────────────────────────────
-- Por ahora acceso completo para authenticated users
ALTER TABLE proveedores_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos_compra_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE locales_compra_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movimientos_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE campos_extra_producto_v2 ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas (ajustar según necesidad)
CREATE POLICY "allow_all_proveedores" ON proveedores_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_productos_compra" ON productos_compra_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_locales_compra" ON locales_compra_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_stock_movimientos" ON stock_movimientos_v2 FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_campos_extra" ON campos_extra_producto_v2 FOR ALL USING (true) WITH CHECK (true);
