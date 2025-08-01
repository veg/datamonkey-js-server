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
- `job created` - Job submitted to scheduler
- `status update` - Job progress updates  
- `completed` - Analysis finished successfully
- `script error` - Analysis failed
- `validated` - Parameter validation result (for check operations)

### 5. Data Submission Formats

#### Standard Format (Most Analyses)
Most analyses use the socket.io-stream format:

```javascript
import ss from 'socket.io-stream';

function runStandardAnalysis(analysisType, fastaData, jobParams) {
  const stream = ss.createStream();
  
  // Send the analysis request
  socket.emit(`${analysisType}:spawn`, stream, {
    job: jobParams
  });
  
  // Stream the FASTA data
  ss(socket).emit('file', stream, {
    name: 'input.fasta'
  });
  
  stream.write(fastaData);
  stream.end();
}

// Example: BUSTED analysis
const jobParams = {
  analysis_type: 'busted',
  genetic_code: 'Universal',
  // Add other analysis-specific parameters
};

const fastaContent = `>sequence1
ATGCGATCGATCG...
>sequence2
ATGCGATCGATCG...`;

runStandardAnalysis('busted', fastaContent, jobParams);
```

#### FEL Analysis Format (Special Case)
FEL analysis uses a different data format that includes both alignment and tree data:

```javascript
// FEL analysis requires both alignment and tree data in a single payload
function runFELAnalysis(alignmentData, treeData, jobParams) {
  const payload = {
    alignment: alignmentData,  // FASTA format string
    tree: treeData,           // Newick format string
    job: jobParams            // Analysis parameters
  };
  
  socket.emit('fel:spawn', payload);
}

// Example FEL analysis
const alignmentData = `>Human
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT
>Chimp
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT
>Baboon
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCGACTTGGACATTCCT
>RhMonkey
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCGACTTGGACATTCCT
>Cow
AGCATTGTCGTCTGGGGTGCCCTGGATCATGACCTCAACCTGGACATTCCT
>Pig
ACTGAGGTTGTCTGGGGCATCGTGGATCAAGACATCAACCTGGACATTCCT
>Horse
AATATCACCATCTTGGGTGCCCTGGAACGTGATATCAACCTGGACATTCCT
>Cat
GATGATATCGTCTGGGGTACCCTGGGTCAGGACATCAACCTGGACATTCCT
>Mouse
AATGAGACCATCTGGGGTGTCTTGGGTCATGGCATCACCCUGAACATCCCC
>Rat
AGTGGGACCGTCTGGGGTGCCCTGGGTCATGGCATCAACCTGAACATCCCT`;

const treeData = `((((Pig:0.147969,Cow:0.213430):0.085099,Horse:0.165787,Cat:0.264806):0.058611,((RhMonkey:0.002015,Baboon:0.003108):0.022733,(Human:0.004349,Chimp:0.000799):0.011873):0.101856):0.340802,Rat:0.050958,Mouse:0.097950);`;

const felParams = {
  analysis_type: 'fel',
  genetic_code: 'Universal',
  p_value: 0.1,
  branches: 'All',        // Options: 'All', 'Internal', 'Leaves', 'Unlabeled branches'
  bootstrap: 100,
  resample: 1,           // Default: 1 (faster execution)
  model: 'HKY85',
  rate_classes: 3,
  synonymous_rate_variation: false
};

runFELAnalysis(alignmentData, treeData, felParams);
```

### 6. Event Handling Details

#### Job Created Event
```javascript
socket.on('job created', (data) => {
  console.log('Job submitted:', data);
  // data = {
  //   type: "job created",
  //   torque_id: "local_1234567890_12345",
  //   id: "unknown-1234567890", 
  //   status: "queued",
  //   analysis_type: "fel",
  //   scheduler: "local",
  //   created_time: "2025-08-01T04:22:26.947Z",
  //   sites: 17,
  //   sequences: 10
  // }
});
```

#### Status Update Event
```javascript
socket.on('status update', (data) => {
  console.log('Status update:', data);
  // data = {
  //   msg: "Status message or progress info",
  //   torque_id: "local_1234567890_12345",
  //   id: "unknown-1234567890",
  //   analysis_type: "fel", 
  //   phase: "running",
  //   scheduler: "local",
  //   type: "status update"
  // }
});
```

#### Completion Event
```javascript
socket.on('completed', (results) => {
  console.log('Analysis completed:', results);
  // results = {
  //   results: "JSON string of analysis results",
  //   type: "completed"
  // }
  
  // Parse the actual results
  const analysisResults = JSON.parse(results.results);
  console.log('Parsed results:', analysisResults);
});
```

#### Error Event
```javascript
socket.on('script error', (error) => {
  console.error('Analysis failed:', error);
  // error = {
  //   error: "Error description",
  //   stderr: "Standard error output",
  //   stdout: "Standard output",
  //   progress: "Progress file contents", 
  //   type: "script error"
  // }
});
```

### 7. Complete FEL Analysis Example

```javascript
import io from 'socket.io-client';

class FELAnalysisClient {
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
    
    this.socket.on('job created', (data) => {
      console.log(`FEL job created: ${data.id} (${data.torque_id})`);
      console.log(`Sequences: ${data.sequences}, Sites: ${data.sites}`);
    });
    
    this.socket.on('status update', (data) => {
      if (data.msg && data.msg.trim()) {
        console.log('Progress:', data.msg.trim());
      }
    });
    
    this.socket.on('completed', (results) => {
      console.log('FEL analysis completed!');
      const felResults = JSON.parse(results.results);
      console.log('Results:', felResults);
      this.socket.disconnect();
    });
    
    this.socket.on('script error', (error) => {
      console.error('FEL analysis failed:', error.error);
      if (error.stderr) console.error('STDERR:', error.stderr);
      this.socket.disconnect();
    });
  }
  
  runFELAnalysis(alignmentData, treeData, parameters = {}) {
    const defaultParams = {
      analysis_type: 'fel',
      genetic_code: 'Universal',
      p_value: 0.1,
      branches: 'All',
      bootstrap: 100,
      resample: 1,
      model: 'HKY85',
      rate_classes: 3,
      synonymous_rate_variation: false
    };
    
    const jobParams = { ...defaultParams, ...parameters };
    
    const payload = {
      alignment: alignmentData,
      tree: treeData,
      job: jobParams
    };
    
    console.log('Submitting FEL analysis...');
    this.socket.emit('fel:spawn', payload);
  }
  
  validateParameters(parameters) {
    return new Promise((resolve, reject) => {
      this.socket.once('validated', (result) => {
        if (result.valid) {
          resolve(result);
        } else {
          reject(new Error(`Invalid parameters: ${result.errors.join(', ')}`));
        }
      });
      
      this.socket.emit('fel:check', { job: parameters });
    });
  }
}

// Usage example
const client = new FELAnalysisClient('http://localhost:7015');

const alignment = `>Human
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT
>Chimp  
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT`;

const tree = `(Human:0.004349,Chimp:0.000799);`;

// Run analysis after connection
client.socket.on('connected', () => {
  client.runFELAnalysis(alignment, tree, {
    branches: 'All',
    resample: 1  // Fast execution
  });
});
```

### 8. Parameter Validation

```javascript
// Validate FEL parameters before running analysis
socket.on('validated', (result) => {
  if (result.valid) {
    console.log('Parameters are valid');
    // Proceed with actual analysis
  } else {
    console.error('Invalid parameters:', result.errors);
  }
});

socket.emit('fel:check', {
  job: {
    analysis_type: 'fel',
    genetic_code: 'Universal',
    branches: 'All'
  }
});
```

### 9. Reconnecting to Existing Jobs

```javascript
// Reconnect to a job using its ID
socket.emit('fel:resubscribe', {
  id: 'job_id_here'
});
```

### 10. Error Handling

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

### 11. Job Queue Status

```javascript
// Get current job queue status
socket.emit('job queue', {});

socket.on('job queue', (jobs) => {
  console.log('Active jobs:', jobs);
});
```

## Data Format Requirements

### FEL Analysis Data Validation

#### Alignment Data (FASTA Format)
- Must be valid FASTA format with sequence headers starting with `>`
- Sequences must be in-frame codons (length divisible by 3)
- Sequence names must match tree tip labels exactly
- Minimum 4 sequences recommended for meaningful analysis
- Example:
```
>Human
ATGCGATCGATCGATCG...
>Chimp
ATGCGATCGATCGATCG...
```

#### Tree Data (Newick Format)
- Must be valid Newick format phylogenetic tree
- Tip labels must match sequence names in alignment exactly
- Branch lengths should be present for accurate analysis
- Tree can be rooted or unrooted (HyPhy handles both)
- Example:
```
((Human:0.004349,Chimp:0.000799):0.011873);
```

#### Parameter Validation
- `analysis_type`: Must be "fel"
- `genetic_code`: Must be valid genetic code name ("Universal", "Vertebrate Mitochondrial", etc.)
- `branches`: Must be one of: "All", "Internal", "Leaves", "Unlabeled branches"
- `resample`: Positive integer (default: 1 for faster execution)
- `bootstrap`: Boolean or positive integer
- `p_value`: Number between 0 and 1

## Implementation Notes

### File Handling
- **Standard analyses**: Use `socket.io-stream` for file uploads
- **FEL analysis**: Use direct payload format (no streaming required)
- Results are returned as JSON objects in the `completed` event

### Job Management
- Each job gets a unique ID for tracking
- Jobs can be cancelled using the `cancel` event
- Use `resubscribe` to reconnect to long-running jobs
- Local execution jobs have IDs like `local_timestamp_pid`

### Performance Considerations
- Analyses can be computationally intensive and long-running
- FEL analysis with `resample: 1` is much faster than `resample: 100`
- Implement proper timeout handling for long-running jobs
- Consider showing progress indicators using status updates
- Large alignments (>1000 sequences) may require significant processing time

### Security
- The server runs bioinformatics tools that execute on the system
- Ensure the server is properly secured and isolated
- Validate all input data before submission
- Consider implementing rate limiting for API endpoints

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