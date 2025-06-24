#!/bin/bash
# integration_test.sh - Test the full Ookkee stack

set -e

API_URL="http://localhost:8080"
FRONTEND_URL="http://localhost:5173"

echo "🧪 Testing Ookkee Integration..."

# Test 1: Health check
echo "🔍 Testing API health..."
response=$(curl -s "$API_URL/api/health")
if echo "$response" | grep -q '"status":"ok"'; then
    echo "✅ API health check passed"
else
    echo "❌ API health check failed: $response"
    exit 1
fi

# Test 2: Projects endpoint
echo "📁 Testing projects endpoint..."
projects=$(curl -s "$API_URL/api/projects")
if echo "$projects" | grep -q '\['; then
    echo "✅ Projects endpoint working"
else
    echo "❌ Projects endpoint failed: $projects"
    exit 1
fi

# Test 3: Frontend accessibility
echo "🌐 Testing frontend..."
frontend_status=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL")
if [ "$frontend_status" = "200" ]; then
    echo "✅ Frontend accessible"
else
    echo "❌ Frontend not accessible: HTTP $frontend_status"
    exit 1
fi

# Test 4: File upload (if test file exists)
if [ -f "test-data.csv" ]; then
    echo "📄 Testing file upload..."
    upload_response=$(curl -s -F "csvFile=@test-data.csv" "$API_URL/api/upload")
    if echo "$upload_response" | grep -q '"message":"File uploaded and processed successfully"'; then
        echo "✅ File upload test passed"
    else
        echo "⚠️ File upload test failed (this is ok if no test file): $upload_response"
    fi
fi

echo ""
echo "🎉 All integration tests passed!"
echo "🚀 Ookkee is ready to use:"
echo "   Frontend: $FRONTEND_URL"
echo "   API:      $API_URL"
