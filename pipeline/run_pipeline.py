#!/usr/bin/env python3
"""
run_pipeline.py — Stellara daily content pipeline
Runs all three steps in sequence:
  1. generate_content.py  — Claude API → content.json
  2. render_cards.py      — PNG + MP4 per slot
  3. send_summary.py      — morning email via Resend
"""

import os, sys, subprocess, datetime
from pathlib import Path

BASE_DIR = Path(__file__).parent
VENV_PYTHON = BASE_DIR / "venv" / "bin" / "python3"

# Use venv python if available, otherwise system python3
PYTHON = str(VENV_PYTHON) if VENV_PYTHON.exists() else "python3"


def run(script: str):
    print(f"\n{'='*50}")
    print(f"  Running {script}")
    print(f"{'='*50}")
    result = subprocess.run(
        [PYTHON, str(BASE_DIR / script)],
        cwd=BASE_DIR,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        print(f"\n[run_pipeline] ✗ {script} failed — stopping.")
        sys.exit(result.returncode)
    print(f"[run_pipeline] ✓ {script} done")


def main():
    print(f"[run_pipeline] Starting — {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")

    required_vars = ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "SUMMARY_EMAIL"]
    missing = [v for v in required_vars if not os.environ.get(v)]
    if missing:
        print(f"[run_pipeline] Missing env vars: {', '.join(missing)}")
        sys.exit(1)

    run("generate_content.py")
    run("render_cards.py")
    run("send_summary.py")

    print(f"\n[run_pipeline] All done — {datetime.datetime.now().strftime('%H:%M')}")


if __name__ == "__main__":
    main()
