package jobs

import (
	"context"
	"sync"
	"time"
)

// AICategorizeResponse represents the AI categorization result
type AICategorizeResponse struct {
	RowID      int     `json:"rowId"`
	CategoryID int     `json:"categoryId"`
	Confidence float32 `json:"confidence"`
	Reasoning  string  `json:"reasoning,omitempty"`
}

// JobStatus represents the status of a job
type JobStatus string

const (
	JobStatusQueued     JobStatus = "queued"
	JobStatusProcessing JobStatus = "processing"
	JobStatusCompleted  JobStatus = "completed"
	JobStatusFailed     JobStatus = "failed"
)

// AICategorizationJob represents a job for AI categorization
type AICategorizationJob struct {
	ID               string                 `json:"id"`
	ProjectID        int                    `json:"project_id"`
	Model            string                 `json:"model"`
	Status           JobStatus              `json:"status"`
	SelectedExpenses []int                  `json:"selected_expenses"` // IDs of expenses being processed
	Categorizations  []AICategorizeResponse `json:"categorizations,omitempty"`
	Message          string                 `json:"message,omitempty"`
	Error            string                 `json:"error,omitempty"`
	CreatedAt        time.Time              `json:"created_at"`
	StartedAt        *time.Time             `json:"started_at,omitempty"`
	CompletedAt      *time.Time             `json:"completed_at,omitempty"`
	Ctx              context.Context        `json:"-"`
	Cancel           context.CancelFunc     `json:"-"`
}

// JobManager manages AI categorization jobs
type JobManager struct {
	mu   sync.RWMutex
	jobs map[string]*AICategorizationJob
}

// NewJobManager creates a new job manager
func NewJobManager() *JobManager {
	return &JobManager{
		jobs: make(map[string]*AICategorizationJob),
	}
}

// CreateJob creates a new AI categorization job
func (jm *JobManager) CreateJob(projectID int, model string) *AICategorizationJob {
	return jm.createJob(projectID, model)
}

// createJob is the internal implementation
func (jm *JobManager) createJob(projectID int, model string) *AICategorizationJob {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	// Generate unique job ID
	jobID := generateJobID()

	// Create job context with cancellation
	ctx, cancel := context.WithCancel(context.Background())

	job := &AICategorizationJob{
		ID:        jobID,
		ProjectID: projectID,
		Model:     model,
		Status:    JobStatusQueued,
		CreatedAt: time.Now(),
		Ctx:       ctx,
		Cancel:    cancel,
	}

	jm.jobs[jobID] = job
	return job
}

// GetID returns the job ID
func (j *AICategorizationJob) GetID() string {
	return j.ID
}

// GetStatus returns the job status
func (j *AICategorizationJob) GetStatus() string {
	return string(j.Status)
}

// GetSelectedExpenses returns the selected expense IDs
func (j *AICategorizationJob) GetSelectedExpenses() []int {
	return j.SelectedExpenses
}

// GetJob retrieves a job by ID
func (jm *JobManager) GetJob(jobID string) (*AICategorizationJob, bool) {
	jm.mu.RLock()
	defer jm.mu.RUnlock()

	job, exists := jm.jobs[jobID]
	return job, exists
}

// UpdateJob updates a job's status and data
func (jm *JobManager) UpdateJob(jobID string, updates func(*AICategorizationJob)) error {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	job, exists := jm.jobs[jobID]
	if !exists {
		return ErrJobNotFound
	}

	updates(job)
	return nil
}

// DeleteJob removes a job from the manager
func (jm *JobManager) DeleteJob(jobID string) {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	if job, exists := jm.jobs[jobID]; exists {
		if job.Cancel != nil {
			job.Cancel()
		}
		delete(jm.jobs, jobID)
	}
}

// CleanupOldJobs removes jobs older than the specified duration
func (jm *JobManager) CleanupOldJobs(maxAge time.Duration) {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	for id, job := range jm.jobs {
		if job.CreatedAt.Before(cutoff) {
			if job.Cancel != nil {
				job.Cancel()
			}
			delete(jm.jobs, id)
		}
	}
}

// generateJobID generates a unique job ID
func generateJobID() string {
	return "job_" + time.Now().Format("20060102_150405") + "_" + randString(8)
}

// randString generates a random string of specified length
func randString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[int(time.Now().UnixNano()%int64(len(charset)))]
	}
	return string(b)
}

// ErrJobNotFound indicates that a job was not found
var ErrJobNotFound = JobError{Message: "job not found"}

// JobError represents a job-related error
type JobError struct {
	Message string
}

func (e JobError) Error() string {
	return e.Message
}
