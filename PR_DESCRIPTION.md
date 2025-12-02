# difFUBAR Backend Integration - Complete Implementation

## Summary
Implements full backend support for **differential Fast Unconstrained Bayesian AppRoximation (difFUBAR)** analysis with Julia integration, real-time status updates, and optimized result delivery.

## Key Features

### ✅ **Core Functionality**
- **Julia Integration**: Uses CodonMolecularEvolution.jl v1.11.6+ 
- **SLURM Support**: Full job scheduling and monitoring
- **Real-time Updates**: Live progress tracking via WebSocket
- **Large File Handling**: Optimized for 31MB+ result files
- **Plot Generation**: SVG/PNG visualization files

### ✅ **Performance Optimizations**
- **Direct Socket Transmission**: Large results sent via WebSocket (not Redis)
- **Unified Status Monitoring**: Single progress file for all updates
- **Lightweight Completion**: Minimal Redis messages for job completion
- **Efficient File Handling**: Optimized I/O for large datasets

## Client-Side Integration

### **Socket Events to Listen For**

#### **1. Job Creation & Status**
```javascript
// Initial job creation
socket.on('job created', (data) => {
  // data.torque_id, data.status, data.scheduler, etc.
});

// Real-time status updates
socket.on('status update', (data) => {
  // data.msg contains progress information
  // data.phase, data.status, data.torque_id, etc.
});
```

#### **2. Result Files (Large Files >5MB)**
```javascript
// Main results file (JSON, ~31MB)
socket.on('difFubar results file', (data) => {
  const resultsBuffer = data.buffer;
  const resultsJson = JSON.parse(resultsBuffer.toString());
  // Process difFUBAR analysis results
});
```

#### **3. Plot Files**
```javascript
// Overview plot
socket.on('difFubar overview png', (data) => {
  const imageBuffer = data.buffer;
  // Display overview plot
});

socket.on('difFubar overview svg', (data) => {
  const svgBuffer = data.buffer;
  // Display vector overview plot
});

// Posterior plots
socket.on('difFubar posteriors png', (data) => {
  const imageBuffer = data.buffer;
  // Display posterior distribution plots
});

socket.on('difFubar posteriors svg', (data) => {
  const svgBuffer = data.buffer;
  // Display vector posterior plots
});

// Detection plots
socket.on('difFubar detections png', (data) => {
  const imageBuffer = data.buffer;
  // Display detection plots
});

socket.on('difFubar detections svg', (data) => {
  const svgBuffer = data.buffer;
  // Display vector detection plots
});
```

#### **4. Job Completion**
```javascript
// Final completion notification
socket.on('completed', (data) => {
  // data.results contains completion info
  // For large files: data.results.message, data.results.file_size
  // Job is finished, all files have been sent
});

// Error handling
socket.on('script error', (data) => {
  // data.error contains error information
  // data.stderr, data.stdout for debugging
});
```

### **Event Flow Sequence**
```
1. job created         → Job submitted to SLURM
2. status update       → Real-time progress (multiple events)
3. difFubar overview * → Plot files sent in parallel
4. difFubar posteriors *
5. difFubar detections *
6. difFubar results file → Main results (31MB JSON)
7. completed           → Final notification
```

## Technical Implementation

### **File Size Handling**
- **Small results (<5MB)**: Sent via Redis pub/sub in `completed` event
- **Large results (>5MB)**: Sent via direct WebSocket transmission
- **Threshold**: Configurable, currently 5MB

### **Julia Environment**
```bash
# Setup (already configured in production)
make julia  # Installs all required packages
```

### **Required Julia Packages**
- `CodonMolecularEvolution.jl` (latest from GitHub main)
- `MolecularEvolution.jl`
- `FASTX.jl`
- `JSON.jl`

### **Configuration**
```json
{
  "julia_path": "/home/sweaver/.juliaup/bin/julia",
  "julia_project": "/path/to/.julia_env/",
  "difFubar_walltime": "24:00:00",
  "difFubar_procs": "8",
  "difFubar_memory": "32GB"
}
```

## Testing

### **Test Parameters**
```javascript
{
  "analysis": {
    "pos_threshold": 0.95,
    "mcmc_iterations": 2500, 
    "burnin_samples": 500,
    "concentration_of_dirichlet_prior": 0.5,
    "tagged_nwk_tree": "(tree_with_{Foreground}_{TEST}_tags)"
  }
}
```

### **Expected Output Files**
- `{id}.difFubar.json` (~31MB) - Main results
- `{id}.difFubar_overview.png/svg` - Overview plots  
- `{id}.difFubar_posteriors.png/svg` - Posterior plots
- `{id}.difFubar_detections.png/svg` - Detection plots
- `{id}.difFubar_tagged_input_tree.svg` - Input tree visualization
- `{id}.difFubar_posteriors.csv` - Raw posterior data

## Deployment Notes

### **Production Ready** ✅
- Error handling for all failure modes
- Proper resource cleanup
- SLURM integration tested
- Large file handling optimized

### **Monitoring**
- All events logged with structured logging
- Redis pub/sub health monitoring
- Job completion tracking
- Error rate monitoring

---

## Breaking Changes
- **New Socket Events**: Client must listen for `difFubar results file` 
- **Event Timing**: Large results sent before `completed` event
- **Result Format**: Large files sent as Buffer, not JSON string

## Migration Guide
Update client-side event listeners to handle the new `difFubar results file` event for proper result processing.