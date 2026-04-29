-- Habilitar extensiones (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Borrar job previo si existe
DO $$
BEGIN
  PERFORM cron.unschedule('alertas-sla-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule: cada hora al minuto 7
SELECT cron.schedule(
  'alertas-sla-hourly',
  '7 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://stzrhzbeeeojteycuqsc.supabase.co/functions/v1/alertas-sla',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', '4bc78cc5a8b6b05618328b016ec6ad089a8b4d2c149047fd5565cb93f1ea1020'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $cmd$
);

-- Verificar
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'alertas-sla-hourly';
