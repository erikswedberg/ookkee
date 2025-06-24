# AI Bookkeeping Assistant

A modern web application for AI-powered bookkeeping with human oversight. Built with React + Vite frontend and Go + Chi backend, designed to process CSV financial data with PostgreSQL storage.

## Features

- **File Upload**: Drag-and-drop CSV file upload with validation
- **Real-time Processing**: Visual feedback during file upload with progress tracking
- **Secure Storage**: Files stored securely on the local filesystem with timestamped naming
- **Modern UI**: Clean, responsive interface built with React
- **RESTful API**: Well-structured Go backend with proper error handling

## Project Structure

```
├── frontend/          # React + Vite frontend application
│   ├── src/
│   │   ├── components/
│   │   │   └── FileUpload.jsx
│   │   ├── App.jsx
│   │   └── App.css
│   └── package.json
├── backend/           # Go + Chi backend application
│   ├── main.go
│   └── go.mod
├── uploads/           # Directory for uploaded CSV files
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Go (v1.19 or higher)
- PostgreSQL (for future database functionality)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bookkeeping-assistant
   ```

2. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd ../backend
   go mod tidy
   ```

### Running the Application

1. **Start the backend server** (from the `backend` directory):
   ```bash
   go run main.go
   ```
   The server will start on `http://localhost:8080`

2. **Start the frontend development server** (from the `frontend` directory):
   ```bash
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`

3. **Access the application**
   Open your browser and navigate to `http://localhost:5173`

## API Endpoints

### Health Check
- **GET** `/api/health`
- Returns server status and service information

### File Upload
- **POST** `/api/upload`
- Accepts multipart form data with `csvFile` field
- Validates CSV file format
- Saves files to the `uploads/` directory with timestamp prefix
- Returns upload confirmation with file details

## File Upload Features

- **Drag & Drop**: Users can drag CSV files directly onto the upload area
- **File Browser**: Click to browse and select files
- **Validation**: Only CSV files are accepted
- **Progress Tracking**: Visual progress indicator during upload
- **File Information**: Display file name, size, and type before upload
- **Success/Error Feedback**: Clear status messages for user feedback

## Technical Stack

### Frontend
- **React 18**: Modern React with hooks
- **Vite**: Fast build tool and development server
- **Modern CSS**: Custom CSS with smooth animations and transitions

### Backend
- **Go**: High-performance backend language
- **Chi Router**: Lightweight HTTP router
- **CORS**: Configured for frontend-backend communication
- **File Handling**: Secure multipart form handling

### Planned Features
- **PostgreSQL Integration**: Database storage for processed data
- **AI Processing**: Automated categorization and analysis
- **User Authentication**: Secure user management
- **Data Visualization**: Charts and reports
- **Export Functionality**: Generate reports in various formats

## Development

### File Upload Flow

1. User selects or drags a CSV file
2. Frontend validates file type
3. File is uploaded via POST request to `/api/upload`
4. Backend validates and saves file with timestamp
5. Success confirmation returned to user
6. File stored in `uploads/` directory for further processing

### CORS Configuration

The backend is configured to accept requests from the Vite development server (`http://localhost:5173`) with appropriate CORS headers.

### Error Handling

- Frontend provides user-friendly error messages
- Backend returns appropriate HTTP status codes
- File validation prevents non-CSV uploads
- Progress tracking with timeout handling

## Contributing

This is the initial implementation focusing on the file upload functionality. Future contributions will expand the AI processing capabilities and database integration.
