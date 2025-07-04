package jobs

import (
	"context"
	"log"
	"ookkee/ai"
	"time"
)

// ProcessorConfig holds configuration for the job processor
type ProcessorConfig struct {
	MaxWorkers int
	JobTimeout time.Duration
}

// JobProcessor processes AI categorization jobs
type JobProcessor struct {
	config    ProcessorConfig
	manager   *JobManager
	workQueue chan string
	shutdown  chan struct{}
}

// NewJobProcessor creates a new job processor
func NewJobProcessor(manager *JobManager, config ProcessorConfig) *JobProcessor {
	if config.MaxWorkers <= 0 {
		config.MaxWorkers = 2
	}
	if config.JobTimeout <= 0 {
		config.JobTimeout = 60 * time.Second
	}

	return &JobProcessor{
		config:    config,
		manager:   manager,
		workQueue: make(chan string, config.MaxWorkers*2),
		shutdown:  make(chan struct{}),
	}
}

// Start starts the job processor workers
func (p *JobProcessor) Start() {
	for i := 0; i < p.config.MaxWorkers; i++ {
		go p.worker(i)
	}

	// Start cleanup goroutine
	go p.cleanupWorker()
}

// Stop stops the job processor
func (p *JobProcessor) Stop() {
	close(p.shutdown)
}

// SubmitJob submits a job for processing
func (p *JobProcessor) SubmitJob(jobID string) {
	select {
	case p.workQueue <- jobID:
	default:
		log.Printf("Job queue full, job %s may be delayed", jobID)
		go func() {
			p.workQueue <- jobID
		}()
	}
}

// worker processes jobs
func (p *JobProcessor) worker(workerID int) {
	log.Printf("Job processor worker %d started", workerID)
	defer log.Printf("Job processor worker %d stopped", workerID)

	for {
		select {
		case <-p.shutdown:
			return
		case jobID := <-p.workQueue:
			p.processJob(jobID)
		}
	}
}

// processJob processes a single job
func (p *JobProcessor) processJob(jobID string) {
	log.Printf("Processing job %s", jobID)

	// Get job from manager
	job, exists := p.manager.GetJob(jobID)
	if !exists {
		log.Printf("Job %s not found, skipping", jobID)
		return
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(job.Ctx, p.config.JobTimeout)
	defer cancel()

	// Mark job as processing
	now := time.Now()
	err := p.manager.UpdateJob(jobID, func(j *AICategorizationJob) {
		j.Status = JobStatusProcessing
		j.StartedAt = &now
	})
	if err != nil {
		log.Printf("Failed to update job %s status: %v", jobID, err)
		return
	}

	// Process the job
	result, err := p.runAICategorizationJob(ctx, job)
	if err != nil {
		log.Printf("Job %s failed: %v", jobID, err)
		// Mark job as failed
		completedAt := time.Now()
		p.manager.UpdateJob(jobID, func(j *AICategorizationJob) {
			j.Status = JobStatusFailed
			j.Error = err.Error()
			j.CompletedAt = &completedAt
		})
		return
	}

	// Mark job as completed
	completedAt := time.Now()
	err = p.manager.UpdateJob(jobID, func(j *AICategorizationJob) {
		j.Status = JobStatusCompleted
		j.Categorizations = result.Categorizations
		j.Message = result.Message
		j.CompletedAt = &completedAt
	})
	if err != nil {
		log.Printf("Failed to update job %s with results: %v", jobID, err)
		return
	}

	log.Printf("Job %s completed successfully", jobID)
}

// runAICategorizationJob executes the actual AI categorization logic
func (p *JobProcessor) runAICategorizationJob(ctx context.Context, job *AICategorizationJob) (*AICategorizationResult, error) {
	// This is the same logic as in the original handler, but adapted for job processing

	// Step 1: Get expenses from job (already selected when job was created)
	if len(job.SelectedExpenses) == 0 {
		return &AICategorizationResult{
			SelectedExpenseIDs: []int{},
			Categorizations:    []AICategorizeResponse{},
			Message:            "No expenses selected for processing",
		}, nil
	}

	// Convert selected expense IDs to ExpenseForAI structs
	expensesToCategorize, err := ai.GetExpensesByIDs(ctx, job.SelectedExpenses)
	if err != nil {
		return nil, err
	}

	// Step 2: Get available categories from database
	categoryDetails, err := ai.GetAllCategories(ctx)
	if err != nil {
		return nil, err
	}

	if len(categoryDetails) == 0 {
		return nil, JobError{Message: "No categories available for categorization"}
	}

	// Step 3: Process with AI (this would call the actual AI categorization logic)
	result, err := ai.ProcessCategorizationLogic(ctx, job.ProjectID, expensesToCategorize, categoryDetails, job.Model)
	if err != nil {
		return nil, err
	}

	// Convert ai.CategorizeResponse to AICategorizeResponse
	categorizations := make([]AICategorizeResponse, len(result.Categorizations))
	for i, cat := range result.Categorizations {
		categorizations[i] = AICategorizeResponse{
			RowID:      cat.RowID,
			CategoryID: cat.CategoryID,
			Confidence: cat.Confidence,
			Reasoning:  cat.Reasoning,
		}
	}

	return &AICategorizationResult{
		SelectedExpenseIDs: result.SelectedExpenseIDs,
		Categorizations:    categorizations,
		Message:            result.Message,
	}, nil
}

// AICategorizationResult represents the result of AI categorization
type AICategorizationResult struct {
	SelectedExpenseIDs []int                  `json:"selected_expense_ids"`
	Categorizations    []AICategorizeResponse `json:"categorizations"`
	Message            string                 `json:"message"`
}

// cleanupWorker periodically cleans up old jobs
func (p *JobProcessor) cleanupWorker() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-p.shutdown:
			return
		case <-ticker.C:
			// Clean up jobs older than 1 hour
			p.manager.CleanupOldJobs(time.Hour)
		}
	}
}
