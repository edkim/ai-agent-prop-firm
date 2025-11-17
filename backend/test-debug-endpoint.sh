#!/bin/bash

echo "🔍 Testing Scanner Debug Endpoint"
echo ""
echo "Testing gap-down VWAP reclaim template on TSLA for 2025-01-10..."
echo ""

# Read the scanner template
SCANNER_CODE=$(cat src/templates/scanners/gap-down-vwap-reclaim.ts)

# Test the debug endpoint
curl -X POST http://localhost:3000/api/scanner-debug \
  -H "Content-Type: application/json" \
  -d "{
    \"scannerCode\": $(echo "$SCANNER_CODE" | jq -Rs .),
    \"ticker\": \"TSLA\",
    \"date\": \"2025-01-10\",
    \"explain\": false
  }" | jq .

echo ""
echo "✅ Test complete!"
