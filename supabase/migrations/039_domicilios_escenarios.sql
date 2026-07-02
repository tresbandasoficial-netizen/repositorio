-- Migration 039: Escenarios financieros de domicilios
--
-- Reemplaza la combinación confusa de cobrar_al_cliente + metodo_pago
-- con un campo tipo_cobro que describe claramente el flujo de dinero:
--
--   regalado  → TB asume el costo del domicilio (genera gasto automático)
--   mensajero → El cliente paga al mensajero en efectivo; el mensajero
--               retiene el valor del domicilio y entrega el resto a TB.
--   tb_cobra  → El cliente transfiere el total (producto + domicilio) a TB;
--               TB luego paga el valor del domicilio a la mensajería
--               (genera deuda pendiente con la mensajería).

alter table domicilios
  add column if not exists tipo_cobro          text check (tipo_cobro in ('regalado','mensajero','tb_cobra')),
  add column if not exists cuenta_id           uuid references cuentas(id),
  add column if not exists cuenta_domicilio_id uuid references cuentas(id),
  add column if not exists pendiente_mensajeria boolean not null default false;

-- Derivar tipo_cobro de los campos anteriores para registros históricos
update domicilios
set tipo_cobro = case
  when cobrar_al_cliente = false     then 'regalado'
  when metodo_pago = 'transferencia' then 'tb_cobra'
  else 'mensajero'
end
where tipo_cobro is null;
