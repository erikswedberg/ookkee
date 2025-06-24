import { useState, useEffect, useRef, useCallback } from 'react'

const SpreadsheetView = ({ project }) => {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const containerRef = useRef(null)
  const LIMIT = 50

  // Reset when project changes
  useEffect(() => {
    setExpenses([])
    setOffset(0)
    setHasMore(true)
    setError(null)
  }, [project.id])

  // Load initial data
  useEffect(() => {
    if (project) {
      loadExpenses(0, true)
    }
  }, [project])

  const loadExpenses = async (currentOffset, isInitial = false) => {
    if (loading) return
    
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `http://localhost:8080/api/projects/${project.id}/expenses?offset=${currentOffset}&limit=${LIMIT}`
      )
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const newExpenses = await response.json()
      
      if (newExpenses.length < LIMIT) {
        setHasMore(false)
      }
      
      setExpenses(prev => isInitial ? newExpenses : [...prev, ...newExpenses])
      setOffset(currentOffset + newExpenses.length)
    } catch (err) {
      console.error('Failed to fetch expenses:', err)
      setError(`Failed to load expenses: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!containerRef.current || loading || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight

    // Load more when user scrolls past 80%
    if (scrollPercentage > 0.8) {
      loadExpenses(offset)
    }
  }, [loading, hasMore, offset])

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const formatAmount = (amount) => {
    if (amount === null || amount === undefined) return ''
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const getAmountClass = (amount) => {
    if (amount === null || amount === undefined) return ''
    return amount >= 0 ? 'amount-positive' : 'amount-negative'
  }

  const formatDate = (dateString) => {
    if (!dateString) return ''
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  const getColumnValue = (expense, column) => {
    // First check if it's in the raw_data
    if (expense.raw_data && expense.raw_data[column]) {
      return expense.raw_data[column]
    }
    
    // Then check direct properties
    switch (column.toLowerCase()) {
      case 'description':
        return expense.description || ''
      case 'amount':
        return expense.amount
      default:
        return ''
    }
  }

  // Get all unique columns from the data
  const getColumns = () => {
    if (expenses.length === 0) return []
    
    const columnSet = new Set()
    
    expenses.forEach(expense => {
      if (expense.raw_data) {
        Object.keys(expense.raw_data).forEach(key => columnSet.add(key))
      }
    })
    
    // Convert to array and sort, putting common columns first
    const columns = Array.from(columnSet)
    const priority = ['Date', 'Description', 'Amount', 'Category']
    
    return columns.sort((a, b) => {
      const aIndex = priority.indexOf(a)
      const bIndex = priority.indexOf(b)
      
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return a.localeCompare(b)
    })
  }

  const columns = getColumns()

  if (error) {
    return (
      <div className="spreadsheet-view">
        <div className="spreadsheet-header">
          <h2>{project.name}</h2>
          <div className="spreadsheet-meta">
            {project.row_count} rows • {project.original_name}
          </div>
        </div>
        <div className="error">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="spreadsheet-view">
      <div className="spreadsheet-header">
        <h2>{project.name}</h2>
        <div className="spreadsheet-meta">
          {project.row_count} rows • {project.original_name} • 
          Showing {expenses.length} of {project.row_count}
        </div>
      </div>
      
      <div className="spreadsheet-content">
        <div className="table-container" ref={containerRef}>
          {columns.length === 0 ? (
            <div className="loading">Loading...</div>
          ) : (
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>#</th>
                  {columns.map(column => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense, index) => (
                  <tr key={expense.id}>
                    <td>{expense.row_index + 1}</td>
                    {columns.map(column => {
                      const value = getColumnValue(expense, column)
                      const isAmount = column.toLowerCase().includes('amount')
                      const isDate = column.toLowerCase().includes('date')
                      
                      return (
                        <td 
                          key={column}
                          className={isAmount ? `amount-cell ${getAmountClass(value)}` : ''}
                        >
                          {isAmount && typeof value === 'number' ? formatAmount(value) :
                           isDate ? formatDate(value) :
                           value || ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          
          {loading && (
            <div className="loading">
              Loading more rows...
            </div>
          )}
          
          {!hasMore && expenses.length > 0 && (
            <div className="loading">
              All {expenses.length} rows loaded
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SpreadsheetView
