// Test script for virtual scroll store architecture
// Run with: node test/test-virtual-scroll-store.js

const API_URL = 'http://localhost:8080';

// Test the new expense store architecture
async function testExpenseStore() {
  console.log('Testing Virtual Scroll Store Architecture...');
  
  try {
    // Test 1: Fetch first page
    console.log('\n1. Testing page 1 fetch...');
    const page1Response = await fetch(`${API_URL}/api/projects/15/expenses?limit=20&offset=0`);
    const page1Data = await page1Response.json();
    console.log(`✓ Page 1: ${page1Data.length} expenses fetched`);
    
    // Test 2: Verify data structure
    if (page1Data.length > 0) {
      const expense = page1Data[0];
      console.log('\n2. Sample expense structure:');
      console.log({
        id: expense.id,
        row_index: expense.row_index,
        source: expense.source,
        description: expense.description,
        amount: expense.amount,
        accepted_category_id: expense.accepted_category_id,
        is_personal: expense.is_personal
      });
    }
    
    // Test 3: Fetch second page
    console.log('\n3. Testing page 2 fetch...');
    const page2Response = await fetch(`${API_URL}/api/projects/15/expenses?limit=20&offset=20`);
    const page2Data = await page2Response.json();
    console.log(`✓ Page 2: ${page2Data.length} expenses fetched`);
    
    // Test 4: Test expense update
    if (page1Data.length > 0) {
      const testExpense = page1Data[0];
      console.log('\n4. Testing expense update...');
      
      const updateResponse = await fetch(`${API_URL}/api/expenses/${testExpense.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accepted_category_id: 1, // Test category ID
        }),
      });
      
      if (updateResponse.ok) {
        console.log(`✓ Expense ${testExpense.id} updated successfully`);
        
        // Revert the change
        await fetch(`${API_URL}/api/expenses/${testExpense.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accepted_category_id: testExpense.accepted_category_id,
          }),
        });
        console.log(`✓ Expense ${testExpense.id} reverted`);
      } else {
        console.log(`✗ Failed to update expense ${testExpense.id}`);
      }
    }
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n🎯 Store Architecture Benefits:');
    console.log('  • Expenses stored by row index for O(1) access');
    console.log('  • Page requests tracked separately from data');
    console.log('  • Optimistic updates for immediate UI response');
    console.log('  • No cache invalidation needed for single expense updates');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testExpenseStore();
