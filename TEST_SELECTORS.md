# Test Selectors for Ookkee

This document lists all the `data-testid` attributes available in the Ookkee application for automated testing and browser automation.

## Project Management

### Projects Sidebar
- `[data-testid='add-project-button']` - Button to create a new project (+ button in sidebar)
- `[data-testid='categories-button']` - Categories navigation button

### Project Modal (Create/Edit)
- `[data-testid='project-name-input']` - Input field for project name
- `[data-testid='csv-file-input']` - File upload input for CSV files
- `[data-testid='upload-file-button']` - Button to upload the selected file
- `[data-testid='create-project-button']` - Button to create/save the project
- `[data-testid='cancel-button']` - Button to cancel modal and close

## Usage Notes

### File Upload Workflow
1. Click `[data-testid='add-project-button']` to open the project creation modal
2. Enter project name in `[data-testid='project-name-input']`
3. Select CSV file using `[data-testid='csv-file-input']`
4. Click `[data-testid='upload-file-button']` to upload and create project
5. Or click `[data-testid='cancel-button']` to abort

### Browser Automation Example
```javascript
// Open project creation modal
const addButton = document.querySelector('[data-testid="add-project-button"]');
addButton.click();

// Wait for modal and fill form
const nameInput = document.querySelector('[data-testid="project-name-input"]');
const fileInput = document.querySelector('[data-testid="csv-file-input"]');
const uploadButton = document.querySelector('[data-testid="upload-file-button"]');
```

## Implementation Location

These test selectors are implemented in:
- `frontend/src/components/ProjectsSidebar.jsx` - add-project-button, categories-button
- `frontend/src/components/ProjectModal.jsx` - project-name-input, create-project-button, cancel-button
- `frontend/src/components/FileUpload.jsx` - csv-file-input, upload-file-button

Last updated: Based on commit 7323d7a (Erikswedberg/sketch/fix file upload)
