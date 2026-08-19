-- Migration 174: el admin puede borrar traslados de caja.
-- Necesario para revertir movimientos de préstamos (mig. 173): eliminar un
-- abono o un préstamo borra sus traslados de ingreso/egreso externo.
create policy traslados_delete_admin on traslados_caja for delete to authenticated
  using (exists (select 1 from usuarios u where u.id = auth.uid() and u.rol = 'admin'));
