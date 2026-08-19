-- Migration 172: el radio es de dos vías — los asesores también transmiten
-- (pedido de Johan/Ronaldo 15-ago: "ellos también me pueden responder").
-- El visor sigue solo escuchando.

drop policy if exists radio_insert on mensajes_radio;

create policy radio_insert on mensajes_radio for insert to authenticated
  with check (
    emisor_id = auth.uid()
    and exists (
      select 1 from usuarios u
      where u.id = auth.uid() and u.rol in ('admin', 'asesor') and u.activo
    )
  );
