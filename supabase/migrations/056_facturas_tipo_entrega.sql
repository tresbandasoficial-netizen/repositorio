-- Migration 056: Tipo de entrega en facturas
--
-- Integra Facturación con Domicilios / Mensajerías / Gastos.
-- Al facturar, el asesor define cómo se entrega el pedido:
--   tienda     → el cliente recoge, no genera nada extra
--   domicilio  → mensajero local (exneider/servigo): genera domicilio + recaudo
--   envio      → empresa de envíos: genera gasto si alguien lo paga
--
-- quien_paga_entrega:
--   cliente         → el cliente asume el domicilio/envío
--   tb              → Tres Bandas lo asume (genera gasto automático)
--   contra_entrega  → solo aplica a envío; no genera nada (operativo)

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'tienda'
    CHECK (tipo_entrega IN ('tienda','domicilio','envio')),
  ADD COLUMN IF NOT EXISTS mensajeria_entrega text
    CHECK (mensajeria_entrega IN ('exneider','servigo')),
  ADD COLUMN IF NOT EXISTS valor_entrega integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quien_paga_entrega text
    CHECK (quien_paga_entrega IN ('cliente','tb','contra_entrega'));
