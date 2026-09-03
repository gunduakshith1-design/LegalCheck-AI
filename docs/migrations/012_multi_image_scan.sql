-- Migration 012: Multi-Image Scan Support
-- Adds image_paths JSONB column to product_scans for storing multiple image URLs.
-- The existing image_path TEXT column is preserved for backward compatibility.

ALTER TABLE public.product_scans
  ADD COLUMN IF NOT EXISTS image_paths JSONB;

COMMENT ON COLUMN public.product_scans.image_paths IS 'Array of image URLs for multi-image scans (Front, Back, Side). Single-image scans keep this NULL and use image_path.';
