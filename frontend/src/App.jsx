import { useState } from 'react'
import FileUpload from './components/FileUpload'
import './App.css'

function App() {
  return (
    <div className="App">
      <header className="app-header">
        <h1>AI Bookkeeping Assistant</h1>
        <p>Upload your CSV files to get started with automated bookkeeping</p>
      </header>
      <main className="app-main">
        <FileUpload />
      </main>
    </div>
  )
}

export default App
