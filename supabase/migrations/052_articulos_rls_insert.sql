-- Migration 052: Allow authenticated users to insert articles to catalog
-- Previously only admins could insert, blocking asesores from saving new articles

CREATE POLICY "autenticados pueden insertar articulos"
  ON articulos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
