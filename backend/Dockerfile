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

# Final stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for SSL/TLS, Java (for Flyway), bash, and netcat
RUN apk --no-cache add ca-certificates openjdk11-jre bash curl netcat-openbsd

# Install Flyway CLI
RUN curl -L https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/10.18.2/flyway-commandline-10.18.2-linux-x64.tar.gz \
    | tar -xzC /opt && \
    ln -s /opt/flyway-10.18.2/flyway /usr/local/bin/flyway

# Copy the binary from builder stage
COPY --from=builder /app/main .

# Copy startup script
COPY startup.sh .
RUN chmod +x startup.sh

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8080

# Run startup script (migrations + app)
CMD ["./startup.sh"]
