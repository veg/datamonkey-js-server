#!/bin/bash

export PATH=/usr/local/bin:$PATH

for arg in "$@"; do
  case $arg in
    fn=*)
      fn="${arg#*=}"
      ;;
    tree_fn=*)
      tree_fn="${arg#*=}"
      ;;
    sfn=*)
      sfn="${arg#*=}"
      ;;
    pfn=*)
      pfn="${arg#*=}"
      ;;
    rfn=*)
      rfn="${arg#*=}"
      ;;
    treemode=*)
      treemode="${arg#*=}"
      ;;
    genetic_code=*)
      genetic_code="${arg#*=}"
      ;;
    analysis_type=*)
      analysis_type="${arg#*=}"
      ;;
    cwd=*)
      cwd="${arg#*=}"
      ;;
    msaid=*)
      msaid="${arg#*=}"
      ;;
    procs=*)
      procs="${arg#*=}"
      ;;
    number_of_grid_points=*)
      number_of_grid_points="${arg#*=}"
      ;;
    concentration_of_dirichlet_prior=*)
      concentration_of_dirichlet_prior="${arg#*=}"
      ;;
    method=*)
      method="${arg#*=}"
      ;;
    ebf=*)
      ebf="${arg#*=}"
      ;;
    radius_threshold=*)
      radius_threshold="${arg#*=}"
      ;;
  esac
done

if [ -f /etc/profile.d/lmod.sh ]; then
  source /etc/profile.d/lmod.sh
  module load aocc/1.3.0 2>/dev/null || echo "Failed to load aocc/1.3.0"
  module load openmpi/gnu/3.1.6 2>/dev/null || echo "Failed to load openmpi/gnu/3.1.6"
else
  echo "Module system not available, using system environment"
fi

FN=$fn
CWD=$cwd
TREE_FN=$tree_fn
STATUS_FILE=$sfn
PROGRESS_FILE=$pfn
RESULTS_FN=$fn.FUBAR-inv.json
GENETIC_CODE=$genetic_code
GRIDPOINTS="${number_of_grid_points:-20}"
CONCENTRATION="${concentration_of_dirichlet_prior:-0.5}"
METHOD="${method:-Variational-Bayes}"
EBF="${ebf:-10}"
RADIUS_THRESHOLD="${radius_threshold:-0.5}"
PROCS=${procs:-1}

HYPHY_REGULAR=$CWD/../../.hyphy/hyphy
HYPHY_NON_MPI=$CWD/../../.hyphy/HYPHYMP
HYPHY_MPI=$CWD/../../.hyphy/HYPHYMPI

if [ -f "$HYPHY_NON_MPI" ]; then
  HYPHY=$HYPHY_NON_MPI
  echo "Using non-MPI HYPHY: $HYPHY"
elif [ -f "$HYPHY_REGULAR" ]; then
  HYPHY=$HYPHY_REGULAR
  echo "Using regular HYPHY: $HYPHY"
else
  HYPHY=$(which hyphy 2>/dev/null || echo "$CWD/../../.hyphy/hyphy")
  echo "Using fallback HYPHY: $HYPHY"
fi

HYPHY_PATH=$CWD/../../.hyphy/res/

BSTILL=$HYPHY_PATH/TemplateBatchFiles/SelectionAnalyses/B-STILL.bf

export HYPHY_PATH=$HYPHY_PATH

trap 'echo "Error" > "$STATUS_FILE"; exit 1' ERR

echo "PROCS: $PROCS"
echo "SLURM_JOB_ID: $SLURM_JOB_ID"
echo "PROGRESS_FILE: '$PROGRESS_FILE'"
echo "STATUS_FILE: '$STATUS_FILE'"
echo "FN: '$FN'"
echo "TREE_FN: '$TREE_FN'"
echo "RESULTS_FN: '$RESULTS_FN'"
echo "GRIDPOINTS: '$GRIDPOINTS'"
echo "CONCENTRATION: '$CONCENTRATION'"
echo "METHOD: '$METHOD'"
echo "EBF: '$EBF'"
echo "RADIUS_THRESHOLD: '$RADIUS_THRESHOLD'"

if [ -n "$SLURM_JOB_ID" ]; then
  echo "Running under SLURM with job ID: $SLURM_JOB_ID"
  MPI_TYPE="${slurm_mpi_type:-pmix}"
  echo "Using MPI type: $MPI_TYPE"
else
  echo "Running without SLURM, using local execution"
fi

if [ -n "$SLURM_JOB_ID" ]; then
  echo "Using SLURM execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  echo "srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH b-still --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --method $METHOD --ebf $EBF --radius-threshold $RADIUS_THRESHOLD --output $RESULTS_FN >> \"$PROGRESS_FILE\""
  srun --mpi=$MPI_TYPE -n $PROCS $HYPHY LIBPATH=$HYPHY_PATH b-still --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --method "$METHOD" --ebf $EBF --radius-threshold $RADIUS_THRESHOLD --output $RESULTS_FN >> "$PROGRESS_FILE"
else
  echo "Using local HYPHY execution: $HYPHY"
  export TOLERATE_NUMERICAL_ERRORS=1
  echo "$HYPHY LIBPATH=$HYPHY_PATH b-still --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --method $METHOD --ebf $EBF --radius-threshold $RADIUS_THRESHOLD --output $RESULTS_FN >> \"$PROGRESS_FILE\""
  $HYPHY LIBPATH=$HYPHY_PATH b-still --alignment $FN --tree $TREE_FN --code $GENETIC_CODE --concentration_parameter $CONCENTRATION --grid $GRIDPOINTS --method "$METHOD" --ebf $EBF --radius-threshold $RADIUS_THRESHOLD --output $RESULTS_FN >> "$PROGRESS_FILE"
fi

echo "Completed" > "$STATUS_FILE"
