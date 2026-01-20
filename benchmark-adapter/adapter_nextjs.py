import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List

import requests


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


def request_report(base_url: str, payload: Dict[str, object], timeout: int) -> str:
  response = requests.post(f"{base_url}/api/research", json=payload, timeout=timeout)
  response.raise_for_status()
  data = response.json()
  report = data.get("report")
  if not isinstance(report, str):
    raise ValueError("Missing report in API response")
  return report


def stream_progress(base_url: str, payload: Dict[str, object], timeout: int) -> str:
  report: str | None = None
  with requests.post(
    f"{base_url}/api/research/stream",
    json=payload,
    stream=True,
    timeout=timeout
  ) as response:
    response.raise_for_status()
    for line in response.iter_lines(decode_unicode=True):
      if not line:
        continue
      if not line.startswith("data: "):
        continue
      data = line[len("data: ") :]
      print(f"[stream] {data}")
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
      if event.get("type") == "complete":
        event_report = event.get("report")
        if isinstance(event_report, str):
          report = event_report
          break
  if report is None:
    raise ValueError("Stream ended without report")
  return report


def main() -> None:
  parser = argparse.ArgumentParser(description="Run DeepResearch Bench against Next.js API")
  parser.add_argument("--base-url", default="http://localhost:3000", help="Next.js base URL")
  parser.add_argument("--model-name", default="nextjs-agent", help="Output model name")
  parser.add_argument("--max-iterations", type=int, default=15)
  parser.add_argument("--max-concurrent-researchers", type=int, default=3)
  parser.add_argument("--enable-web-scraping", action="store_true", default=True)
  parser.add_argument("--disable-web-scraping", action="store_true", default=False)
  parser.add_argument("--limit", type=int, default=0, help="Limit number of tasks (0 = all)")
  parser.add_argument("--timeout", type=int, default=600)
  parser.add_argument("--resume", action="store_true", default=True)
  parser.add_argument("--no-resume", action="store_true", default=False)
  parser.add_argument("--verbose", action="store_true", default=False)
  parser.add_argument("--stream-progress", action="store_true", default=False)
  parser.add_argument("--retries", type=int, default=1)
  parser.add_argument("--retry-delay", type=int, default=5)
  parser.add_argument("--query-file", default="../deep_research_bench_reference/data/prompt_data/query.jsonl")
  parser.add_argument("--output-dir", default="../deep_research_bench_reference/data/test_data/raw_data")

  args = parser.parse_args()

  enable_web_scraping = True
  if args.disable_web_scraping:
    enable_web_scraping = False
  elif args.enable_web_scraping:
    enable_web_scraping = True

  resume = True
  if args.no_resume:
    resume = False

  query_path = Path(args.query_file)
  output_path = Path(args.output_dir) / f"{args.model_name}.jsonl"

  if not query_path.exists():
    print(f"Query file not found: {query_path}")
    sys.exit(1)

  tasks = load_jsonl(query_path)
  if args.limit and args.limit > 0:
    tasks = tasks[: args.limit]

  if args.verbose:
    print(
      "Loaded {} tasks from {} (limit={}, resume={}, scraping={}, timeout={}s, maxIterations={}, maxConcurrentResearchers={}, retries={})".format(
        len(tasks),
        query_path,
        args.limit,
        resume,
        enable_web_scraping,
        args.timeout,
        args.max_iterations,
        args.max_concurrent_researchers,
        args.retries,
      )
    )

  existing_ids = set()
  if resume and output_path.exists():
    for row in load_jsonl(output_path):
      task_id = row.get("id")
      if isinstance(task_id, (str, int)):
        existing_ids.add(task_id)

  if args.verbose:
    print("Output path: {}".format(output_path))
    if output_path.exists():
      print("Found {} existing rows".format(len(existing_ids)))

  rows: List[Dict[str, object]] = []
  processed = 0
  total = len(tasks)

  def flush_rows() -> None:
    nonlocal rows
    if rows:
      append_jsonl(output_path, rows)
      rows = []

  for task in tasks:
    task_id = task.get("id")
    prompt = task.get("prompt")

    if not isinstance(task_id, (str, int)) or not isinstance(prompt, str):
      continue

    if resume and task_id in existing_ids:
      continue

    payload = {
      "prompt": prompt,
      "maxIterations": args.max_iterations,
      "maxConcurrentResearchers": args.max_concurrent_researchers,
      "enableWebScraping": enable_web_scraping
    }

    if args.verbose:
      print("Requesting {} at {}".format(task_id, args.base_url))

    attempt = 0
    while True:
      try:
        start_time = time.time()
        if args.stream_progress:
          report = stream_progress(args.base_url, payload, args.timeout)
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
        break
      except Exception as exc:
        attempt += 1
        print("[error] {} (attempt {}/{}): {}".format(task_id, attempt, args.retries, exc))
        if attempt > args.retries:
          break
        time.sleep(args.retry_delay)

    if args.stream_progress:
      time.sleep(0.25)

  flush_rows()

  print("Done. Output: {}".format(output_path))


if __name__ == "__main__":
  main()
