#!/bin/bash
# env.sh - Load environment variables from config files

if [ "$1" != "" ]; then
  ENV_FILE="config/.envrc.$1"
else
  ENV_FILE="config/.envrc.example"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file $ENV_FILE not found!"
  echo "Available environments:"
  ls config/.envrc.* 2>/dev/null || echo "  No environment files found"
  exit 1
fi

echo "Loading environment from $ENV_FILE..."

# Enable auto-export of variables
set -a

# Load and export each variable
while IFS= read -r line; do
  # Skip empty lines and comments
  if [[ -n "$line" && ! "$line" =~ ^[[:space:]]*# ]]; then
    echo "Setting: $line"
    # Use eval to properly set the variable in current shell
    eval "$line"
  fi
done < <(grep -v '^[[:space:]]*#' "$ENV_FILE" | grep -v '^[[:space:]]*$')

# Disable auto-export
set +a

echo "Environment loaded successfully!"
