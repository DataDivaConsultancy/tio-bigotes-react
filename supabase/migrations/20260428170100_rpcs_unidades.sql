-- Actualiza rpc_crear_producto_compra y rpc_actualizar_producto_compra
-- para aceptar p_unidades_por_paquete

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
    p_stock_minimo numeric DEFAULT 0,
    p_unidades_por_paquete numeric DEFAULT 1
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
    v_id integer;
    v_forma text;
    v_plazo text;
BEGIN
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
        forma_pago, plazo_pago, producto_venta_id, stock_minimo,
        unidades_por_paquete
    ) VALUES (
        p_nombre, p_proveedor_id, p_cod_proveedor, p_cod_interno,
        p_medidas, p_color, p_unidad_medida, p_unidad_minima_compra,
        p_dia_pedido, p_dia_entrega, p_precio, p_tipo_iva,
        p_forma_pago, p_plazo_pago, p_producto_venta_id, p_stock_minimo,
        COALESCE(p_unidades_por_paquete, 1)
    )
    RETURNING id INTO v_id;

    RETURN json_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'Código interno ya existe');
END;
$$;

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
    p_activo boolean DEFAULT NULL,
    p_unidades_por_paquete numeric DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
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
        activo              = COALESCE(p_activo, activo),
        unidades_por_paquete = COALESCE(p_unidades_por_paquete, unidades_por_paquete)
    WHERE id = p_id;

    RETURN json_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'Código interno ya existe');
END;
$$;
