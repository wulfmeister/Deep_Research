import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

import requests


STREAM_READ_TIMEOUT = 60  # seconds without data before considering stream stalled


def load_jsonl(path: Path) -> List[Dict[str, object]]:
  items: List[Dict[str, object]] = []
  with path.open("r", encoding="utf-8") as file:
    for line in file:
      line = line.strip()
      if not line:
        continue
      items.append(json.loads(line))
  return items


def append_jsonl(path: Path, rows: List[Dict[str, object]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("a", encoding="utf-8") as file:
    for row in rows:
      file.write(json.dumps(row, ensure_ascii=False) + "\n")


def check_api_health(base_url: str, timeout: int = 10) -> bool:
  """Check if the API is reachable and responding."""
  try:
    response = requests.get(f"{base_url}/api/research/stream", timeout=timeout)
    # A 400 error is expected since we're not passing a prompt
    return response.status_code in (200, 400)
  except requests.RequestException as e:
    print(f"[health] API health check failed: {e}")
    return False


def request_report(base_url: str, payload: Dict[str, object], timeout: int) -> str:
  response = requests.post(f"{base_url}/api/research", json=payload, timeout=timeout)
  response.raise_for_status()
  data = response.json()
  report = data.get("report")
  if not isinstance(report, str):
    raise ValueError("Missing report in API response")
  return report


def stream_progress(
  base_url: str,
  payload: Dict[str, object],
  timeout: int,
  read_timeout: int = STREAM_READ_TIMEOUT
) -> str:
  """Stream SSE events with read timeout to detect stalled streams."""
  report: Optional[str] = None

  # Use a tuple for timeout: (connect_timeout, read_timeout)
  # The read_timeout applies to each chunk read
  with requests.post(
    f"{base_url}/api/research/stream",
    json=payload,
    stream=True,
    timeout=(30, read_timeout)  # 30s connect, read_timeout for reads
  ) as response:
    response.raise_for_status()

    last_data_time = time.time()
    buffer = ""

    # Use iter_content for more control over buffering
    for chunk in response.iter_content(chunk_size=8192, decode_unicode=True):
      current_time = time.time()

      # Check for stalled stream
      if current_time - last_data_time > read_timeout:
        raise TimeoutError(f"Stream stalled: no data received for {read_timeout}s")

      if not chunk:
        continue

      last_data_time = current_time
      buffer += chunk

      # Process complete SSE events (terminated by double newline)
      while "\n\n" in buffer:
        event_data, buffer = buffer.split("\n\n", 1)

        # Extract data from SSE event
        for line in event_data.split("\n"):
          if not line.startswith("data: "):
            continue

          data = line[len("data: "):]
          # Truncate log for large payloads
          log_data = data if len(data) < 500 else data[:200] + f"... ({len(data)} chars)"
          print(f"[stream] {log_data}")

          try:
            event = json.loads(data)
          except json.JSONDecodeError:
            continue

          if not isinstance(event, dict):
            continue

          if event.get("type") == "error":
            message = event.get("message")
            if isinstance(message, str):
              raise ValueError(message)
            raise ValueError("Stream error")

          # Heartbeat events keep connection alive but are not logged
          if event.get("type") == "heartbeat":
            continue

          if event.get("type") == "complete":
            event_report = event.get("report")
            if isinstance(event_report, str):
              report = event_report
              break

        if report is not None:
          break

  if report is None:
    raise ValueError("Stream ended without report")
  return report


def log_failed_task(
  output_dir: Path,
  task_id: str | int,
  prompt: str,
  error: str,
  attempts: int
) -> None:
  """Log a failed task to failed_tasks.jsonl."""
  failed_path = output_dir / "failed_tasks.jsonl"
  failed_row = {
    "id": str(task_id),
    "prompt": prompt,
    "error": error,
    "attempts": attempts,
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
  }
  append_jsonl(failed_path, [failed_row])


def main() -> None:
  parser = argparse.ArgumentParser(description="Run DeepResearch Bench against Next.js API")
  parser.add_argument("--base-url", default="http://localhost:3000", help="Next.js base URL")
  parser.add_argument("--model-name", default="nextjs-agent", help="Output model name")
  parser.add_argument("--max-iterations", type=int, default=15)
  parser.add_argument("--max-concurrent-researchers", type=int, default=3)

  # Mutually exclusive web scraping flags
  scraping_group = parser.add_mutually_exclusive_group()
  scraping_group.add_argument(
    "--enable-web-scraping",
    dest="enable_web_scraping",
    action="store_true",
    help="Enable web scraping (default)"
  )
  scraping_group.add_argument(
    "--disable-web-scraping",
    dest="enable_web_scraping",
    action="store_false",
    help="Disable web scraping"
  )
  parser.set_defaults(enable_web_scraping=True)

  parser.add_argument("--limit", type=int, default=0, help="Limit number of tasks (0 = all)")
  parser.add_argument("--task-ids", type=str, default="",
                      help="Comma-separated task IDs to run (e.g., '51,52,53')")
  parser.add_argument("--timeout", type=int, default=600)
  parser.add_argument("--stream-read-timeout", type=int, default=STREAM_READ_TIMEOUT,
                      help="Timeout for stream reads (seconds without data)")

  # Mutually exclusive resume flags
  resume_group = parser.add_mutually_exclusive_group()
  resume_group.add_argument(
    "--resume",
    dest="resume",
    action="store_true",
    help="Resume from existing output (default)"
  )
  resume_group.add_argument(
    "--no-resume",
    dest="resume",
    action="store_false",
    help="Start fresh, ignoring existing output"
  )
  parser.set_defaults(resume=True)

  parser.add_argument("--verbose", action="store_true", default=False)
  parser.add_argument("--stream-progress", action="store_true", default=False)
  parser.add_argument("--retries", type=int, default=1)
  parser.add_argument("--retry-delay", type=int, default=5)
  parser.add_argument("--query-file", default="../deep_research_bench_reference/data/prompt_data/query.jsonl")
  parser.add_argument("--output-dir", default="../deep_research_bench_reference/data/test_data/raw_data")
  parser.add_argument("--local-output-dir", default="tmp",
                      help="Additional local output directory (relative to script) for easy viewing")
  parser.add_argument("--check-health", action="store_true", default=False,
                      help="Check API health before starting")
  parser.add_argument("--original-prompts", action="store_true", default=False,
                      help="Use original prompts instead of optimized ones")

  args = parser.parse_args()

  query_path = Path(args.query_file)
  output_dir = Path(args.output_dir)
  output_path = output_dir / f"{args.model_name}.jsonl"

  # Local output directory (relative to script location for easy viewing)
  script_dir = Path(__file__).parent.parent  # Go up to repo root
  local_output_dir = script_dir / args.local_output_dir
  local_output_path = local_output_dir / f"{args.model_name}.jsonl"

  # Health check
  if args.check_health:
    print(f"[health] Checking API at {args.base_url}...")
    if not check_api_health(args.base_url):
      print("[health] API is not available. Exiting.")
      sys.exit(1)
    print("[health] API is available.")

  if not query_path.exists():
    print(f"Query file not found: {query_path}")
    sys.exit(1)

  tasks = load_jsonl(query_path)
  if args.limit and args.limit > 0:
    tasks = tasks[: args.limit]

  # Filter by specific task IDs if provided
  if args.task_ids:
    task_id_set = set(int(x.strip()) for x in args.task_ids.split(",") if x.strip())
    tasks = [t for t in tasks if t.get("id") in task_id_set]

  if args.verbose:
    print(
      "Loaded {} tasks from {} (limit={}, task_ids={}, resume={}, scraping={}, timeout={}s, "
      "streamReadTimeout={}s, maxIterations={}, maxConcurrentResearchers={}, retries={}, "
      "originalPrompts={})".format(
        len(tasks),
        query_path,
        args.limit,
        args.task_ids,
        args.resume,
        args.enable_web_scraping,
        args.timeout,
        args.stream_read_timeout,
        args.max_iterations,
        args.max_concurrent_researchers,
        args.retries,
        args.original_prompts,
      )
    )

  existing_ids = set()
  if args.resume and output_path.exists():
    for row in load_jsonl(output_path):
      task_id = row.get("id")
      if isinstance(task_id, (str, int)):
        existing_ids.add(task_id)

  if args.verbose:
    print("Output path: {}".format(output_path))
    print("Local output path: {}".format(local_output_path))
    if output_path.exists():
      print("Found {} existing rows".format(len(existing_ids)))

  rows: List[Dict[str, object]] = []
  processed = 0
  failed = 0
  total = len(tasks)

  def flush_rows() -> None:
    nonlocal rows
    if rows:
      append_jsonl(output_path, rows)
      append_jsonl(local_output_path, rows)
      rows = []

  for task in tasks:
    task_id = task.get("id")
    prompt = task.get("prompt")

    if not isinstance(task_id, (str, int)) or not isinstance(prompt, str):
      continue

    if args.resume and task_id in existing_ids:
      continue

    payload = {
      "prompt": prompt,
      "maxIterations": args.max_iterations,
      "maxConcurrentResearchers": args.max_concurrent_researchers,
      "enableWebScraping": args.enable_web_scraping,
      "useOriginalPrompts": args.original_prompts
    }

    if args.verbose:
      print("Requesting {} at {}".format(task_id, args.base_url))

    attempt = 0
    last_error = ""
    success = False

    while attempt <= args.retries:
      attempt += 1
      try:
        start_time = time.time()
        if args.stream_progress:
          report = stream_progress(
            args.base_url,
            payload,
            args.timeout,
            args.stream_read_timeout
          )
        else:
          report = request_report(args.base_url, payload, args.timeout)
        elapsed = time.time() - start_time
        rows.append({
          "id": str(task_id),
          "prompt": prompt,
          "article": report
        })
        processed += 1
        print("[{}/{}] Completed {} ({:.1f}s)".format(processed, total, task_id, elapsed))
        flush_rows()
        success = True
        break
      except Exception as exc:
        last_error = str(exc)
        print("[error] {} (attempt {}/{}): {}".format(task_id, attempt, args.retries + 1, exc))
        if attempt <= args.retries:
          time.sleep(args.retry_delay)

    if not success:
      failed += 1
      log_failed_task(output_dir, task_id, prompt, last_error, attempt)
      print(f"[failed] {task_id} logged to failed_tasks.jsonl")

    if args.stream_progress:
      time.sleep(0.25)

  flush_rows()

  print("Done. Completed: {}, Failed: {}, Output: {}".format(processed, failed, output_path))


if __name__ == "__main__":
  main()
