# DataMonkey JS Server - Client Integration Guide

## Overview
This document provides instructions for integrating a web application with the DataMonkey JS Server as a standalone API service. The server provides bioinformatics analysis services via Socket.IO WebSocket connections.

## Server Setup

### 1. Prerequisites
- Node.js ≥13
- Redis server
- Required bioinformatics tools (HyPhy, etc.)

### 2. Configuration
1. Copy `config.json.tpl` to `config.json`
2. Update configuration values:
   ```json
   {
     "port": 7015,
     "redis_host": "localhost",
     "redis_port": 6379,
     "loglevel": "warn",
     "submit_type": "local"
   }
   ```

   **Available submit_type options:**
   - `"qsub"` - TORQUE/PBS scheduler
   - `"sbatch"` - SLURM scheduler  
   - `"local"` - Direct local execution (no scheduler required)

### 3. Start the Service
```bash
npm install
node server.js
# Or with custom port: node server.js -p 8080
```

## Client Application Integration

### 1. Install Socket.IO Client
```bash
npm install socket.io-client socket.io-stream
```

### 2. Basic Connection Setup
```javascript
import io from 'socket.io-client';
import ss from 'socket.io-stream';

const socket = io('http://localhost:7015');

socket.on('connect', () => {
  console.log('Connected to DataMonkey server');
});

socket.on('connected', (data) => {
  console.log('Server ready:', data.hello);
});
```

### 3. Available Analysis Endpoints

The server provides the following bioinformatics analyses:

#### Core Analyses:
- **absrel** - Adaptive Branch-Site Random Effects Likelihood
- **busted** - Branch-Site Unrestricted Statistical Test for Episodic Diversification
- **fel** - Fixed Effects Likelihood
- **cfel** - Contrast-FEL
- **relax** - RELAX test
- **meme** - Mixed Effects Model of Evolution
- **slac** - Single Likelihood Ancestor Counting
- **gard** - Genetic Algorithm for Recombination Detection
- **fubar** - Fast, Unconstrained Bayesian AppRoximation
- **fade** - FADE method
- **bgm** - BGM analysis
- **prime** - PRIME analysis
- **multihit** - Multi-Hit analysis
- **nrm** - NRM analysis

#### Special Analyses:
- **hivtrace** - HIV molecular transmission network analysis
- **flea** - FLEA pipeline analysis

### 4. Analysis Workflow Pattern

Each analysis follows this event pattern:

#### Events to Send:
- `{analysis}:spawn` - Submit new analysis job
- `{analysis}:check` - Validate parameters only
- `{analysis}:resubscribe` - Reconnect to existing job
- `{analysis}:cancel` - Cancel running job

#### Events to Listen For:
- `status update` - Job progress updates
- `completed` - Analysis finished successfully
- `script error` - Analysis failed

### 5. Example: Running BUSTED Analysis

```javascript
import fs from 'fs';

// Listen for results
socket.on('completed', (results) => {
  console.log('Analysis completed:', results);
  socket.disconnect();
});

socket.on('status update', (status) => {
  console.log('Status:', status.msg);
  if (status.phase) console.log('Phase:', status.phase);
});

socket.on('script error', (error) => {
  console.error('Analysis failed:', error);
});

// Submit BUSTED analysis
function runBustedAnalysis(fastaData, jobParams) {
  const stream = ss.createStream();
  
  // Send the analysis request
  socket.emit('busted:spawn', stream, {
    job: jobParams
  });
  
  // Stream the FASTA data
  ss(socket).emit('file', stream, {
    name: 'input.fasta'
  });
  
  stream.write(fastaData);
  stream.end();
}

// Example job parameters
const jobParams = {
  analysis_type: 'busted',
  genetic_code: 'Universal',
  // Add other analysis-specific parameters
};

const fastaContent = `>sequence1
ATGCGATCGATCG...
>sequence2
ATGCGATCGATCG...`;

runBustedAnalysis(fastaContent, jobParams);
```

### 6. Example: Checking Analysis Parameters

```javascript
// Validate parameters before running analysis
socket.on('validated', (result) => {
  if (result.valid) {
    console.log('Parameters are valid');
    // Proceed with actual analysis
  } else {
    console.error('Invalid parameters:', result.errors);
  }
});

socket.emit('busted:check', {
  job: {
    analysis_type: 'busted',
    genetic_code: 'Universal'
  }
});
```

### 7. Reconnecting to Existing Jobs

```javascript
// Reconnect to a job using its ID
socket.emit('busted:resubscribe', {
  id: 'job_id_here'
});
```

### 8. Error Handling

```javascript
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
});

socket.on('script error', (error) => {
  console.error('Analysis error:', error);
  // Handle analysis failure
});
```

### 9. Job Queue Status

```javascript
// Get current job queue status
socket.emit('job queue', {});

socket.on('job queue', (jobs) => {
  console.log('Active jobs:', jobs);
});
```

## Implementation Notes

### File Handling
- Use `socket.io-stream` for file uploads
- Files are streamed to the server during analysis submission
- Results are returned as JSON objects

### Job Management
- Each job gets a unique ID for tracking
- Jobs can be cancelled using the `cancel` event
- Use `resubscribe` to reconnect to long-running jobs

### Performance Considerations
- Analyses can be computationally intensive and long-running
- Implement proper timeout handling
- Consider showing progress indicators using status updates

### Security
- The server runs bioinformatics tools that execute on the system
- Ensure the server is properly secured and isolated
- Validate all input data before submission

## Troubleshooting

### Common Issues
1. **Connection refused**: Check if server is running and port is correct
2. **Redis errors**: Ensure Redis server is running and accessible
3. **Analysis failures**: Check server logs for detailed error messages
4. **File upload issues**: Verify socket.io-stream is properly configured

### Debugging
- Enable debug logging by setting `loglevel: "debug"` in config.json
- Monitor server console output for detailed execution logs
- Use browser developer tools to inspect WebSocket traffic

## Example Full Integration

```javascript
class DataMonkeyClient {
  constructor(serverUrl = 'http://localhost:7015') {
    this.socket = io(serverUrl);
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('Connected to DataMonkey server');
    });
    
    this.socket.on('connected', (data) => {
      console.log('Server ready:', data.hello);
    });
  }
  
  async runAnalysis(analysisType, fastaData, parameters) {
    return new Promise((resolve, reject) => {
      const stream = ss.createStream();
      
      this.socket.once('completed', resolve);
      this.socket.once('script error', reject);
      
      this.socket.emit(`${analysisType}:spawn`, stream, {
        job: parameters
      });
      
      ss(this.socket).emit('file', stream, {
        name: 'input.fasta'
      });
      
      stream.write(fastaData);
      stream.end();
    });
  }
  
  disconnect() {
    this.socket.disconnect();
  }
}

// Usage
const client = new DataMonkeyClient();
const result = await client.runAnalysis('busted', fastaData, params);
```