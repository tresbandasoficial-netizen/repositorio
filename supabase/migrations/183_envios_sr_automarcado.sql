-- Migration 183: los envíos a Santa Rosa se marcan solos como llegados
--
-- 18 horas después de crear un envío con destino SR, sus pedidos que sigan en
-- camino pasan automáticamente a estado 'santa_rosa' (lo mismo que el botón
-- "Llegó a Santa Rosa", vía el RPC oficial que deja historial). El usuario del
-- cambio es quien creó el envío. Corre cada hora con pg_cron.
--
-- Solo mira envíos de los últimos 14 días: los viejos no se tocan en masa.

create or replace function public.marcar_envios_santa_rosa_auto()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_marcados integer := 0;
  r record;
begin
  for r in
    select distinct ei.pedido_id, e.creado_por
    from envios e
    join sedes sd on sd.id = e.destino_sede_id and sd.codigo = 'SR'
    join envio_items ei on ei.envio_id = e.id and ei.pedido_id is not null
    join pedidos p on p.id = ei.pedido_id
    where e.creado_en <= now() - interval '18 hours'
      and e.creado_en >= now() - interval '14 days'
      and p.estado in ('pendiente', 'comprado', 'usa', 'bucaramanga')
  loop
    begin
      perform cambiar_estado_pedido(r.pedido_id, 'santa_rosa', r.creado_por);
      v_marcados := v_marcados + 1;
    exception when others then
      -- un pedido con problema no frena a los demás
      null;
    end;
  end loop;
  return v_marcados;
end $$;

revoke all on function public.marcar_envios_santa_rosa_auto() from public;
revoke all on function public.marcar_envios_santa_rosa_auto() from anon;
revoke all on function public.marcar_envios_santa_rosa_auto() from authenticated;

do $do$
begin
  perform cron.unschedule('envios-sr-automarcado');
exception when others then null;
end
$do$;

select cron.schedule(
  'envios-sr-automarcado',
  '0 * * * *',
  $cron$select public.marcar_envios_santa_rosa_auto()$cron$
);
