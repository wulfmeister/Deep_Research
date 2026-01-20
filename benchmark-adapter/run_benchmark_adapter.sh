#!/bin/bash
set -euo pipefail

MODEL_NAME="nextjs-agent"
BASE_URL="http://localhost:3000"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BENCH_DIR="$ROOT_DIR/deep_research_bench_reference"
OUTPUT_DIR="$BENCH_DIR/data/test_data/raw_data"
QUERY_FILE="$BENCH_DIR/data/prompt_data/query.jsonl"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
elif [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  source "$ROOT_DIR/.env.local"
  set +a
fi

RUN_FACT=1
LIMIT=""
VERBOSE=""
STREAM_PROGRESS=""
MAX_ITERATIONS=""
MAX_CONCURRENT_RESEARCHERS=""
ENABLE_WEB_SCRAPING=""
DISABLE_WEB_SCRAPING=""
RETRIES=""
RETRY_DELAY=""
STREAM_READ_TIMEOUT=""
CHECK_HEALTH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --race-only)
      RUN_FACT=0
      shift
      ;;
    --limit)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --limit" >&2
        exit 1
      fi
      LIMIT="--limit $2"
      shift 2
      ;;
    --verbose)
      VERBOSE="--verbose"
      shift
      ;;
    --stream-progress)
      STREAM_PROGRESS="--stream-progress"
      shift
      ;;
    --model-name)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --model-name" >&2
        exit 1
      fi
      MODEL_NAME="$2"
      shift 2
      ;;
    --base-url)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --base-url" >&2
        exit 1
      fi
      BASE_URL="$2"
      shift 2
      ;;
    --max-iterations)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --max-iterations" >&2
        exit 1
      fi
      MAX_ITERATIONS="--max-iterations $2"
      shift 2
      ;;
    --max-concurrent-researchers)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --max-concurrent-researchers" >&2
        exit 1
      fi
      MAX_CONCURRENT_RESEARCHERS="--max-concurrent-researchers $2"
      shift 2
      ;;
    --enable-web-scraping)
      ENABLE_WEB_SCRAPING="--enable-web-scraping"
      shift
      ;;
    --disable-web-scraping)
      DISABLE_WEB_SCRAPING="--disable-web-scraping"
      shift
      ;;
    --retries)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --retries" >&2
        exit 1
      fi
      RETRIES="--retries $2"
      shift 2
      ;;
    --retry-delay)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --retry-delay" >&2
        exit 1
      fi
      RETRY_DELAY="--retry-delay $2"
      shift 2
      ;;
    --stream-read-timeout)
      if [[ -z "${2:-}" ]]; then
        echo "Missing value for --stream-read-timeout" >&2
        exit 1
      fi
      STREAM_READ_TIMEOUT="--stream-read-timeout $2"
      shift 2
      ;;
    --check-health)
      CHECK_HEALTH="--check-health"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$QUERY_FILE" ]]; then
  echo "Benchmark query file not found: $QUERY_FILE" >&2
  exit 1
fi

python3 "$ROOT_DIR/benchmark-adapter/adapter_nextjs.py" \
  --base-url "$BASE_URL" \
  --model-name "$MODEL_NAME" \
  --query-file "$QUERY_FILE" \
  --output-dir "$OUTPUT_DIR" \
  $LIMIT \
  $VERBOSE \
  $STREAM_PROGRESS \
  $MAX_ITERATIONS \
  $MAX_CONCURRENT_RESEARCHERS \
  $ENABLE_WEB_SCRAPING \
  $DISABLE_WEB_SCRAPING \
  $RETRIES \
  $RETRY_DELAY \
  $STREAM_READ_TIMEOUT \
  $CHECK_HEALTH

cd "$BENCH_DIR"

if [[ "$RUN_FACT" -eq 1 ]]; then
  if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    echo "Warning: GEMINI_API_KEY not set. FACT evaluation requires Gemini API key." >&2
    echo "Add GEMINI_API_KEY to .env or .env.local" >&2
  fi
  if [[ -z "${JINA_API_KEY:-}" ]]; then
    echo "Warning: JINA_API_KEY not set. FACT evaluation requires Jina API key." >&2
    echo "Add JINA_API_KEY to .env or .env.local" >&2
  fi
  bash run_benchmark.sh
else
  RAW_DATA_DIR="data/test_data/raw_data"
  OUTPUT_DIR="results"
  QUERY_DATA_PATH="data/prompt_data/query.jsonl"
  N_TOTAL_PROCESS=10

  TARGET_MODELS=("$MODEL_NAME") \
  RAW_DATA_DIR="$RAW_DATA_DIR" \
  OUTPUT_DIR="$OUTPUT_DIR" \
  QUERY_DATA_PATH="$QUERY_DATA_PATH" \
  N_TOTAL_PROCESS="$N_TOTAL_PROCESS" \
  python3 -u deepresearch_bench_race.py "$MODEL_NAME" \
    --raw_data_dir "$RAW_DATA_DIR" \
    --max_workers "$N_TOTAL_PROCESS" \
    --query_file "$QUERY_DATA_PATH" \
    --output_dir "$OUTPUT_DIR/race/$MODEL_NAME" \
    $LIMIT
fi
