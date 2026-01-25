FROM gcc:latest

# Install runtime dependencies (curl is used by the application)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy source code
# Assuming the build context is the backend directory
COPY server/ /app/

# Compile the application
# -O2 for optimization
# -pthread might be needed if threads were used (not currently, but good practice)
RUN g++ -o server main.cpp -O2

# Expose the port the server runs on
EXPOSE 8080

# Command to run the executable
CMD ["./server"]
