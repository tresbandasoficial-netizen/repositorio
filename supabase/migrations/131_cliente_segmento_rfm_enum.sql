-- Migration 131: Crear ENUM cliente_segmento_rfm con 7 segmentos

create type cliente_segmento_rfm as enum (
  'campeon',
  'leal',
  'potencial',
  'nuevo',
  'en_riesgo',
  'dormido',
  'perdido'
);
