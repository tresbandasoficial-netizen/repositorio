-- Migración 201: "Link para cliente nuevo" — link de Shopify SIN pedido previo.
--
-- Pedido de Johan: cuando el cliente es totalmente nuevo no hay ni celular
-- para crear el pedido. La asesora arma el link solo con los productos; el
-- cliente llena sus datos en el checkout y el webhook CREA el cliente y el
-- pedido de una vez. El flujo con pedido previo (mig. 200) sigue igual.
--
-- Cambios:
--   · shopify_links.pedido_id pasa a ser opcional; un link sin pedido guarda
--     sede, renglones (formato de crear_pedido), total y notas.
--   · estado 'sin_telefono': el cliente confirmó pero Shopify no trajo un
--     celular usable → no se puede crear el cliente; la asesora ve los datos
--     y crea el pedido a mano.
--   · confirmar_link_nuevo(): TODO en una transacción (cliente + pedido +
--     marca del link) para que un reintento del webhook no duplique pedidos.

alter table shopify_links alter column pedido_id drop not null;

alter table shopify_links
  add column sede_id uuid references sedes(id),
  add column items   jsonb,      -- renglones del pedido a crear (llaves de crear_pedido)
  add column total   integer,
  add column notas   text;

alter table shopify_links drop constraint shopify_links_estado_check;
alter table shopify_links add constraint shopify_links_estado_check
  check (estado in ('pendiente', 'confirmado', 'sin_telefono'));

-- Un link sin pedido tiene que traer con qué crearlo.
alter table shopify_links add constraint shopify_links_sin_pedido_check
  check (pedido_id is not null or (sede_id is not null and items is not null and total is not null));

create index idx_shopify_links_sede_creado on shopify_links(sede_id, creado_en desc);

-- Confirma un link SIN pedido: busca/crea el cliente por celular (llave de
-- identidad), crea el pedido con los renglones guardados y marca el link.
-- Idempotente: si el link ya tiene pedido, devuelve ese pedido sin tocar nada.
-- Solo la llama el webhook con service_role.
create or replace function confirmar_link_nuevo(
  p_link_id            uuid,
  p_telefono           text,   -- ya normalizado (+57…)
  p_nombre             text,
  p_direccion          text,
  p_ciudad             text,
  p_email              text,
  p_shopify_order_id   text,
  p_shopify_order_name text,
  p_datos              jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link        shopify_links%rowtype;
  v_cliente     clientes%rowtype;
  v_cliente_id  uuid;
  v_sede_codigo text;
  v_numero      text;
  v_pedido_id   uuid;
  v_nombre      text := nullif(trim(p_nombre), '');
  v_direccion   text := nullif(trim(p_direccion), '');
  v_ciudad      text := nullif(trim(p_ciudad), '');
  v_email       text := nullif(trim(p_email), '');
  v_anterior    jsonb;
begin
  select * into v_link from shopify_links where id = p_link_id for update;
  if not found then
    raise exception 'link % no existe', p_link_id;
  end if;
  if v_link.pedido_id is not null then
    return v_link.pedido_id;                       -- ya procesado (reintento)
  end if;
  if v_link.sede_id is null or v_link.items is null or v_link.total is null then
    raise exception 'link % sin datos de pedido', p_link_id;
  end if;
  if v_link.creado_por is null then
    raise exception 'link % sin asesor (creado_por)', p_link_id;
  end if;
  if coalesce(trim(p_telefono), '') = '' then
    raise exception 'link % sin telefono', p_link_id;
  end if;

  select * into v_cliente from clientes where telefono_normalizado = trim(p_telefono);
  if found then
    v_cliente_id := v_cliente.id;
    v_anterior := jsonb_build_object(
      'nombre', v_cliente.nombre, 'direccion', v_cliente.direccion,
      'ciudad', v_cliente.ciudad, 'email', v_cliente.email);
    if coalesce(trim(v_cliente.direccion), '') = '' then
      -- Ficha incompleta (sin dirección): lo que llenó el cliente manda.
      update clientes set
        nombre         = coalesce(v_nombre, nombre),
        direccion      = coalesce(v_direccion, direccion),
        ciudad         = coalesce(v_ciudad, ciudad),
        email          = coalesce(v_email, email),
        actualizado_en = now()
      where id = v_cliente_id;
    else
      -- Ficha completa: solo se llenan campos vacíos, jamás se pisa un dato bueno.
      update clientes set
        nombre         = coalesce(nullif(trim(nombre), ''), v_nombre, nombre),
        direccion      = coalesce(nullif(trim(direccion), ''), v_direccion),
        ciudad         = coalesce(nullif(trim(ciudad), ''), v_ciudad),
        email          = coalesce(nullif(trim(email), ''), v_email),
        actualizado_en = now()
      where id = v_cliente_id;
    end if;
    insert into historial_cambios (tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('clientes', v_cliente_id, 'datos_por_link', v_anterior::text,
            jsonb_build_object('nombre', v_nombre, 'direccion', v_direccion, 'ciudad', v_ciudad, 'email', v_email)::text,
            v_link.creado_por);
  else
    insert into clientes (telefono_normalizado, nombre, direccion, ciudad, email)
    values (trim(p_telefono), coalesce(v_nombre, 'Cliente por link'), v_direccion, v_ciudad, v_email)
    returning id into v_cliente_id;
  end if;

  select codigo into v_sede_codigo from sedes where id = v_link.sede_id;
  if v_sede_codigo is null then
    raise exception 'sede % no existe', v_link.sede_id;
  end if;
  v_numero := v_sede_codigo || asignar_numero_pedido();

  v_pedido_id := crear_pedido(
    v_numero,
    v_link.sede_id,
    v_link.creado_por,
    v_cliente_id,
    v_link.total,
    case when v_direccion is null then 'sede' else 'domicilio' end,
    v_direccion,
    v_link.notas,
    v_link.items,
    0,
    'efectivo',
    null::uuid
  );

  update shopify_links set
    pedido_id          = v_pedido_id,
    estado             = 'confirmado',
    shopify_order_id   = p_shopify_order_id,
    shopify_order_name = p_shopify_order_name,
    datos_cliente      = p_datos,
    confirmado_en      = now()
  where id = p_link_id;

  return v_pedido_id;
end;
$$;

revoke all on function confirmar_link_nuevo(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
