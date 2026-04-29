-- Eliminar versión vieja con p_user_id y crear con p_empleado_id
DROP FUNCTION IF EXISTS rpc_reset_password(integer, text);

CREATE OR REPLACE FUNCTION rpc_reset_password(
  p_empleado_id integer,
  p_new_hash    text
)
RETURNS json LANGUAGE plpgsql AS $$
BEGIN
  IF p_empleado_id IS NULL OR p_new_hash IS NULL OR TRIM(p_new_hash) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'parametros_invalidos');
  END IF;
  UPDATE empleados_v2 SET
    password_hash = p_new_hash,
    must_change_password = true
  WHERE id = p_empleado_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'empleado_no_encontrado');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;
