FROM golang:1.24.3-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Flyway stage - get Flyway from official image
FROM flyway/flyway:10-alpine AS flyway

# Final stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for SSL/TLS, Java (for Flyway), bash, netcat, and postgresql-client
RUN apk --no-cache add ca-certificates openjdk11-jre bash netcat-openbsd postgresql-client

# Copy Flyway from official image
COPY --from=flyway /flyway /flyway
RUN ln -s /flyway/flyway /usr/local/bin/flyway && flyway --version

# Copy the binary from builder stage
COPY --from=builder /app/main .

# Copy migration script
COPY migrate.sh .
RUN chmod +x migrate.sh

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8080

# Run migrations then start app
CMD ["sh", "-c", "./migrate.sh && ./main"]
