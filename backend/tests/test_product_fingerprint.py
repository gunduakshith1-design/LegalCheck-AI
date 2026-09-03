"""
Tests for the Product Fingerprint v2 system.

Since the fingerprint logic lives in JavaScript (src/lib/reportService.js),
these Python tests verify the CONCEPTS and LOGIC that the fingerprint implements.

The actual JS fingerprint tests should be run with:
  node --experimental-vm-modules node_modules/.bin/jest src/lib/reportService.test.js

These Python tests serve as documentation and verify the algorithmic properties.
"""

from __future__ import annotations

import hashlib
import re
import sys
import unittest
from pathlib import Path


# ---------------------------------------------------------------------------
# Python port of the fingerprint logic for testing
# ---------------------------------------------------------------------------

def normalise(s: str) -> str:
    """Python port of the JS normalise function."""
    if not s:
        return ''
    s = s.lower()
    # Remove punctuation except dots between digits
    s = re.sub(r'(?<!\d)\.(?!\d)', '', s)
    s = re.sub(r'[;,:!?()/\\]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    # Remove spaces between digits and units
    s = re.sub(r'(\d)\s+(g|kg|ml|l|gm|gms|ltr|ltrs|cm|mm)\b', r'\1\2', s)
    # Standardise unit variants
    s = re.sub(r'gms?\b', 'g', s)
    s = re.sub(r'mls?\b', 'ml', s)
    s = re.sub(r'ltrs?\b', 'l', s)
    return s


def djb2_hash(s: str) -> str:
    """Python port of the DJB2 hash."""
    h = 5381
    for c in s:
        h = ((h << 5) + h + ord(c)) & 0xffffffff
    return format(h & 0xffffffff, '08x')


def compute_fingerprint(fields: dict) -> dict:
    """Python port of computeProductFingerprint."""
    if not fields:
        return {'fingerprint': None, 'confidence': None, 'components': []}
    manufacturer = normalise(fields.get('manufacturer_name', '') or '')
    address = normalise(fields.get('manufacturer_address', '') or '')
    quantity = normalise(fields.get('net_quantity', '') or '')
    common_name = normalise(fields.get('common_name', '') or '')
    country_origin = normalise(fields.get('country_of_origin', '') or '')

    components = []
    if manufacturer:
        components.append(f'mfr:{manufacturer}')
    if address:
        components.append(f'addr:{address}')
    if quantity:
        components.append(f'qty:{quantity}')
    if common_name:
        components.append(f'name:{common_name}')
    if country_origin and country_origin != 'domestic_no_import_indicators':
        components.append(f'origin:{country_origin}')

    if not manufacturer:
        return {'fingerprint': None, 'confidence': None, 'components': []}

    if manufacturer and address and common_name and quantity:
        confidence = 'HIGH'
    elif manufacturer and address and quantity:
        confidence = 'MEDIUM'
    else:
        confidence = 'LOW'

    hash_input = '||'.join(sorted(components))
    h = djb2_hash(hash_input)
    fingerprint = f'v2:{confidence.lower()}:{h}'

    return {'fingerprint': fingerprint, 'confidence': confidence, 'components': components}


# ---------------------------------------------------------------------------
# Test: Normalisation
# ---------------------------------------------------------------------------

class TestNormalisation(unittest.TestCase):
    """Verify the normalise function handles common cases."""

    def test_lowercase(self):
        self.assertEqual(normalise('TATA'), 'tata')

    def test_whitespace_collapse(self):
        self.assertEqual(normalise('  multiple   spaces  '), 'multiple spaces')

    def test_unit_space_removal(self):
        self.assertEqual(normalise('500 g'), '500g')
        self.assertEqual(normalise('250 ml'), '250ml')
        self.assertEqual(normalise('1.5 l'), '1.5l')

    def test_unit_standardisation(self):
        self.assertEqual(normalise('500gms'), '500g')
        self.assertEqual(normalise('250mls'), '250ml')
        self.assertEqual(normalise('1.5ltrs'), '1.5l')

    def test_punctuation_removal(self):
        self.assertEqual(normalise('Pvt. Ltd.'), 'pvt ltd')
        self.assertEqual(normalise('Hello, World!'), 'hello world')

    def test_dots_between_digits_preserved(self):
        self.assertEqual(normalise('1.5 kg'), '1.5kg')

    def test_empty_string(self):
        self.assertEqual(normalise(''), '')
        self.assertEqual(normalise(None), '')

    def test_deterministic(self):
        """Same input always produces same output."""
        inputs = ['Tata Consumer Products Ltd.', '500 g', 'MRP Rs. 299']
        for inp in inputs:
            self.assertEqual(normalise(inp), normalise(inp))


# ---------------------------------------------------------------------------
# Test: Fingerprint Generation
# ---------------------------------------------------------------------------

class TestFingerprintGeneration(unittest.TestCase):
    """Verify fingerprint generation logic."""

    def test_high_confidence(self):
        """HIGH: manufacturer + address + common_name + net_quantity."""
        fields = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '500g',
            'common_name': 'biscuits',
        }
        result = compute_fingerprint(fields)
        self.assertIsNotNone(result['fingerprint'])
        self.assertEqual(result['confidence'], 'HIGH')
        self.assertTrue(result['fingerprint'].startswith('v2:high:'))

    def test_medium_confidence(self):
        """MEDIUM: manufacturer + address + net_quantity."""
        fields = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '500g',
        }
        result = compute_fingerprint(fields)
        self.assertIsNotNone(result['fingerprint'])
        self.assertEqual(result['confidence'], 'MEDIUM')
        self.assertTrue(result['fingerprint'].startswith('v2:medium:'))

    def test_low_confidence(self):
        """LOW: manufacturer + net_quantity only."""
        fields = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'net_quantity': '500g',
        }
        result = compute_fingerprint(fields)
        self.assertIsNotNone(result['fingerprint'])
        self.assertEqual(result['confidence'], 'LOW')
        self.assertTrue(result['fingerprint'].startswith('v2:low:'))

    def test_low_confidence_manufacturer_only(self):
        """LOW: manufacturer only."""
        fields = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
        }
        result = compute_fingerprint(fields)
        self.assertIsNotNone(result['fingerprint'])
        self.assertEqual(result['confidence'], 'LOW')

    def test_null_fields(self):
        """Null fields → null fingerprint."""
        result = compute_fingerprint(None)
        self.assertIsNone(result['fingerprint'])
        self.assertIsNone(result['confidence'])

    def test_empty_fields(self):
        """Empty fields → null fingerprint."""
        result = compute_fingerprint({})
        self.assertIsNone(result['fingerprint'])

    def test_no_manufacturer(self):
        """No manufacturer → null fingerprint."""
        fields = {
            'net_quantity': '500g',
            'manufacturer_address': 'Mumbai',
        }
        result = compute_fingerprint(fields)
        self.assertIsNone(result['fingerprint'])

    def test_deterministic(self):
        """Same inputs always produce same fingerprint."""
        fields = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '500g',
            'common_name': 'biscuits',
        }
        r1 = compute_fingerprint(fields)
        r2 = compute_fingerprint(fields)
        self.assertEqual(r1['fingerprint'], r2['fingerprint'])
        self.assertEqual(r1['confidence'], r2['confidence'])

    def test_different_products_different_fingerprints(self):
        """Different products → different fingerprints."""
        fields_a = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '100g',
            'common_name': 'biscuits',
        }
        fields_b = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '200g',
            'common_name': 'cookies',
        }
        r_a = compute_fingerprint(fields_a)
        r_b = compute_fingerprint(fields_b)
        self.assertNotEqual(r_a['fingerprint'], r_b['fingerprint'])

    def test_same_manufacturer_different_product_name_no_match(self):
        """Same manufacturer + quantity but different product → different fingerprints."""
        fields_a = {
            'manufacturer_name': 'Britannia Industries Ltd.',
            'manufacturer_address': 'Bangalore 560001',
            'net_quantity': '100g',
            'common_name': 'biscuits',
        }
        fields_b = {
            'manufacturer_name': 'Britannia Industries Ltd.',
            'manufacturer_address': 'Bangalore 560001',
            'net_quantity': '100g',
            'common_name': 'cookies',
        }
        r_a = compute_fingerprint(fields_a)
        r_b = compute_fingerprint(fields_b)
        # Different common_name → different fingerprints
        self.assertNotEqual(r_a['fingerprint'], r_b['fingerprint'])

    def test_same_manufacturer_different_quantity_no_match(self):
        """Same manufacturer but different quantity → different fingerprints."""
        fields_a = {
            'manufacturer_name': 'Britannia Industries Ltd.',
            'manufacturer_address': 'Bangalore 560001',
            'net_quantity': '100g',
        }
        fields_b = {
            'manufacturer_name': 'Britannia Industries Ltd.',
            'manufacturer_address': 'Bangalore 560001',
            'net_quantity': '200g',
        }
        r_a = compute_fingerprint(fields_a)
        r_b = compute_fingerprint(fields_b)
        self.assertNotEqual(r_a['fingerprint'], r_b['fingerprint'])

    def test_harmless_formatting_differences_match(self):
        """Same product with formatting differences → same fingerprint."""
        fields_a = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '500 g',
            'common_name': 'Biscuits',
        }
        fields_b = {
            'manufacturer_name': 'TATA CONSUMER PRODUCTS LTD.',
            'manufacturer_address': 'MUMBAI 400001',
            'net_quantity': '500g',
            'common_name': 'biscuits',
        }
        r_a = compute_fingerprint(fields_a)
        r_b = compute_fingerprint(fields_b)
        self.assertEqual(r_a['fingerprint'], r_b['fingerprint'])

    def test_country_of_origin_included_when_present(self):
        """Country of origin is included when available."""
        fields = {
            'manufacturer_name': 'Global Corp',
            'manufacturer_address': 'Shanghai',
            'net_quantity': '1kg',
            'common_name': 'tea',
            'country_of_origin': 'China',
        }
        result = compute_fingerprint(fields)
        self.assertIn('origin:china', result['components'])

    def test_domestic_origin_excluded(self):
        """Domestic (no import indicators) origin is excluded."""
        fields = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai',
            'net_quantity': '500g',
            'country_of_origin': 'DOMESTIC_NO_IMPORT_INDICATORS',
        }
        result = compute_fingerprint(fields)
        origin_components = [c for c in result['components'] if c.startswith('origin:')]
        self.assertEqual(len(origin_components), 0)


# ---------------------------------------------------------------------------
# Test: Confidence Levels
# ---------------------------------------------------------------------------

class TestConfidenceLevels(unittest.TestCase):
    """Verify confidence level determination."""

    def test_high_confidence_requires_four_fields(self):
        """HIGH requires manufacturer + address + common_name + quantity."""
        fields = {
            'manufacturer_name': 'Test Corp',
            'manufacturer_address': 'Mumbai',
            'net_quantity': '100g',
            'common_name': 'biscuits',
        }
        result = compute_fingerprint(fields)
        self.assertEqual(result['confidence'], 'HIGH')

    def test_medium_confidence_requires_three_fields(self):
        """MEDIUM requires manufacturer + address + quantity."""
        fields = {
            'manufacturer_name': 'Test Corp',
            'manufacturer_address': 'Mumbai',
            'net_quantity': '100g',
        }
        result = compute_fingerprint(fields)
        self.assertEqual(result['confidence'], 'MEDIUM')

    def test_low_confidence_for_two_fields(self):
        """LOW for manufacturer + quantity only."""
        fields = {
            'manufacturer_name': 'Test Corp',
            'net_quantity': '100g',
        }
        result = compute_fingerprint(fields)
        self.assertEqual(result['confidence'], 'LOW')

    def test_low_confidence_for_manufacturer_only(self):
        """LOW for manufacturer only."""
        fields = {
            'manufacturer_name': 'Test Corp',
        }
        result = compute_fingerprint(fields)
        self.assertEqual(result['confidence'], 'LOW')


# ---------------------------------------------------------------------------
# Test: Backward Compatibility
# ---------------------------------------------------------------------------

class TestBackwardCompatibility(unittest.TestCase):
    """Verify that the v2 format is backward compatible."""

    def test_v2_format_has_version_prefix(self):
        """v2 fingerprints start with 'v2:'."""
        fields = {
            'manufacturer_name': 'Test Corp',
            'manufacturer_address': 'Mumbai',
            'net_quantity': '100g',
        }
        result = compute_fingerprint(fields)
        self.assertTrue(result['fingerprint'].startswith('v2:'))

    def test_v2_format_has_confidence(self):
        """v2 fingerprints include confidence level."""
        fields = {
            'manufacturer_name': 'Test Corp',
            'manufacturer_address': 'Mumbai',
            'net_quantity': '100g',
        }
        result = compute_fingerprint(fields)
        parts = result['fingerprint'].split(':')
        self.assertEqual(len(parts), 3)
        self.assertIn(parts[1], ['high', 'medium', 'low'])

    def test_v2_format_has_hash(self):
        """v2 fingerprints include a hex hash."""
        fields = {
            'manufacturer_name': 'Test Corp',
            'manufacturer_address': 'Mumbai',
            'net_quantity': '100g',
        }
        result = compute_fingerprint(fields)
        parts = result['fingerprint'].split(':')
        # Hash should be 8 hex characters
        self.assertEqual(len(parts[2]), 8)
        self.assertTrue(all(c in '0123456789abcdef' for c in parts[2]))


# ---------------------------------------------------------------------------
# Test: Security Properties
# ---------------------------------------------------------------------------

class TestSecurityProperties(unittest.TestCase):
    """Verify security invariants of the fingerprint system."""

    def test_fingerprint_does_not_expose_manufacturer_name(self):
        """Fingerprint is a hash, not the raw manufacturer name."""
        fields = {
            'manufacturer_name': 'Tata Consumer Products Ltd.',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '500g',
        }
        result = compute_fingerprint(fields)
        self.assertNotIn('tata', result['fingerprint'])
        self.assertNotIn('consumer', result['fingerprint'])

    def test_fingerprint_does_not_expose_address(self):
        """Fingerprint does not contain address information."""
        fields = {
            'manufacturer_name': 'Test Corp',
            'manufacturer_address': 'Mumbai 400001',
            'net_quantity': '100g',
        }
        result = compute_fingerprint(fields)
        self.assertNotIn('mumbai', result['fingerprint'])
        self.assertNotIn('400001', result['fingerprint'])

    def test_fingerprint_components_are_normalised(self):
        """Components in the result are normalised (lowercase, cleaned)."""
        fields = {
            'manufacturer_name': 'TATA CONSUMER PRODUCTS LTD.',
            'manufacturer_address': 'MUMBAI 400001',
            'net_quantity': '500 G',
        }
        result = compute_fingerprint(fields)
        for comp in result['components']:
            self.assertEqual(comp, comp.lower())


if __name__ == "__main__":
    unittest.main()
