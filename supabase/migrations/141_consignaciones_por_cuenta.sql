-- Migración 141: contador de consignaciones por cuenta (tope DIAN)
--
-- Para no pasarse del tope anual de consignaciones por cuenta. El tope es por
-- PERSONA, y las cuentas están a nombre de personas distintas (Bancolombia
-- Carlos, Nequi Johan…), así que la vista da el acumulado por cuenta y la
-- pantalla lo agrupa por titular.
--
-- Consignación = todo lo que ENTRÓ a la cuenta en el año calendario:
--   pagos de pedidos + abonos a facturas + pagos de mensajería + traslados que
--   llegaron a la cuenta (consignar el efectivo del día también es consignación).
--
-- Se excluyen las cajas de efectivo (la plata en el cajón no es una consignación)
-- y la cuenta de crédito (no es dinero que se mueve).
--
-- El año se toma en hora Bogotá, no del servidor.

-- Tope por cuenta. Null = usar el tope general que define la app, porque el
-- valor en UVT cambia cada año y no debe quedar enterrado en una migración.
alter table cuentas
  add column if not exists limite_consignacion bigint
    check (limite_consignacion is null or limite_consignacion > 0);

-- Titular de la cuenta, para poder sumar las de una misma persona. Null = no
-- asignado; la pantalla lo agrupa como "sin titular".
alter table cuentas
  add column if not exists titular text;

create or replace view vista_consignaciones_cuenta as
with anio as (
  select extract(year from (now() at time zone 'America/Bogota'))::int as y
),
rango as (
  select make_date(y, 1, 1) as desde, make_date(y, 12, 31) as hasta, y from anio
),
entradas as (
  select p.cuenta_id, p.monto, p.fecha
  from pagos p, rango r
  where p.anulado = false and p.metodo <> 'credito'
    and p.fecha between r.desde and r.hasta
  union all
  select pf.cuenta_id, pf.monto, pf.fecha
  from pagos_factura pf, rango r
  where pf.anulado = false and pf.metodo <> 'credito'
    and pf.fecha between r.desde and r.hasta
  union all
  select pm.cuenta_id, pm.monto, pm.fecha
  from pagos_mensajeria pm, rango r
  where pm.tipo = 'pago' and pm.fecha between r.desde and r.hasta
  union all
  select t.destino_cuenta_id, t.monto, t.fecha
  from traslados_caja t, rango r
  where t.fecha between r.desde and r.hasta
)
select
  c.id                                  as cuenta_id,
  c.nombre,
  c.tipo,
  c.titular,
  c.sede_id,
  c.limite_consignacion,
  (select y from anio)                  as anio,
  coalesce(sum(e.monto), 0)::bigint     as consignado,
  count(e.monto)::int                   as movimientos,
  max(e.fecha)                          as ultima_consignacion
from cuentas c
left join entradas e on e.cuenta_id = c.id
where c.tipo not in ('efectivo', 'credito')
group by c.id, c.nombre, c.tipo, c.titular, c.sede_id, c.limite_consignacion;

-- Vista de negocio: solo con sesión (regla de la migración 111).
revoke all on vista_consignaciones_cuenta from anon;
grant select on vista_consignaciones_cuenta to authenticated;
revoke all on cuentas from anon;

-- Titulares que se pueden deducir del nombre de la cuenta. El resto se asigna a
-- mano desde la pantalla — no se adivina lo que no está claro.
update cuentas set titular = 'Carlos'      where metodo_pago = 'bancolombia_carlos'      and titular is null;
update cuentas set titular = 'Cristian'    where metodo_pago = 'bancolombia_cristian'    and titular is null;
update cuentas set titular = 'Huber'       where metodo_pago = 'bancolombia_huber'       and titular is null;
update cuentas set titular = 'Jhan Carlos' where metodo_pago = 'bancolombia_jhan_carlos' and titular is null;
update cuentas set titular = 'Johan'       where metodo_pago in ('bancolombia_johan', 'nequi_johan') and titular is null;
update cuentas set titular = 'Mayra'       where metodo_pago = 'bancolombia_mayra'       and titular is null;
update cuentas set titular = 'Ronaldo'     where metodo_pago = 'bancolombia_ronaldo'     and titular is null;
update cuentas set titular = 'Marisol'     where metodo_pago = 'nequi_marisol'           and titular is null;
update cuentas set titular = 'Luisa'       where metodo_pago = 'nequi_luisa'             and titular is null;
