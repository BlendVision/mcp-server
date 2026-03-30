#!/bin/bash

# Script to test BlendVision API connection

set -e

echo "🔍 Testing BlendVision API Connection"
echo "======================================"
echo ""

# Check environment variables
if [ -z "$BLENDVISION_API_TOKEN" ]; then
    echo "❌ BLENDVISION_API_TOKEN is not set"
    echo ""
    echo "Please set your credentials:"
    echo "  export BLENDVISION_API_TOKEN=your_token"
    echo "  export BLENDVISION_ORG_ID=your_org_id"
    exit 1
fi

if [ -z "$BLENDVISION_ORG_ID" ]; then
    echo "❌ BLENDVISION_ORG_ID is not set"
    exit 1
fi

BASE_URL="${BLENDVISION_BASE_URL:-https://api.one.blendvision.com}"

echo "📍 Base URL: $BASE_URL"
echo "🔑 Token: ${BLENDVISION_API_TOKEN:0:20}..."
echo "🏢 Org ID: $BLENDVISION_ORG_ID"
echo ""

# Test Account API
echo "Testing Account API..."
ACCOUNT_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $BLENDVISION_API_TOKEN" \
  -H "x-bv-org-id: $BLENDVISION_ORG_ID" \
  "$BASE_URL/bv/account/v1/accounts")

HTTP_CODE=$(echo "$ACCOUNT_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$ACCOUNT_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Account API: Success"
    echo "   Response: $(echo $BODY | head -c 100)..."
else
    echo "❌ Account API: Failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
fi

echo ""

# Test Organization API
echo "Testing Organization API..."
ORG_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $BLENDVISION_API_TOKEN" \
  -H "x-bv-org-id: $BLENDVISION_ORG_ID" \
  "$BASE_URL/bv/organization/v1/organizations/$BLENDVISION_ORG_ID")

HTTP_CODE=$(echo "$ORG_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$ORG_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Organization API: Success"
    echo "   Response: $(echo $BODY | head -c 100)..."
else
    echo "❌ Organization API: Failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
fi

echo ""

# Test CMS API (list VODs)
echo "Testing CMS API (VODs)..."
CMS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $BLENDVISION_API_TOKEN" \
  -H "x-bv-org-id: $BLENDVISION_ORG_ID" \
  "$BASE_URL/bv/cms/v1/vods?page_size=1")

HTTP_CODE=$(echo "$CMS_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$CMS_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ CMS API: Success"
    echo "   Response: $(echo $BODY | head -c 100)..."
else
    echo "❌ CMS API: Failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
fi

echo ""
echo "🎉 API Connection Test Complete!"
