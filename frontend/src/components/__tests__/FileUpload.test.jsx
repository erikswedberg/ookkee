import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FileUpload from '../FileUpload'

// Mock fetch globally
global.fetch = vi.fn()

describe('FileUpload Component', () => {
  beforeEach(() => {
    fetch.mockClear()
  })

  it('renders upload interface', () => {
    render(<FileUpload onUploadSuccess={vi.fn()} />)
    
    expect(screen.getByText('Upload Your CSV File')).toBeInTheDocument()
    expect(screen.getByText('Browse Files')).toBeInTheDocument()
  })

  it('shows file info when file is selected', () => {
    render(<FileUpload onUploadSuccess={vi.fn()} />)
    
    const fileInput = screen.getByRole('button', { name: /browse files/i })
    const file = new File(['test,data\n1,2'], 'test.csv', { type: 'text/csv' })
    
    // Simulate file selection
    const input = document.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    })
    
    fireEvent.change(input)
    
    expect(screen.getByText('File Ready for Upload')).toBeInTheDocument()
    expect(screen.getByText('test.csv')).toBeInTheDocument()
  })

  it('validates file type', () => {
    render(<FileUpload onUploadSuccess={vi.fn()} />)
    
    const input = document.querySelector('input[type="file"]')
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' })
    
    Object.defineProperty(input, 'files', {
      value: [invalidFile],
      writable: false,
    })
    
    fireEvent.change(input)
    
    // Should show error for non-CSV file
    expect(screen.queryByText('File Ready for Upload')).not.toBeInTheDocument()
  })
})
