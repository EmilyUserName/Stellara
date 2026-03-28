#!/usr/bin/env python3
"""
send_summary.py
Sends a morning summary email with today's 3 content pieces.
Includes captions inline and MP4s attached.
"""

import os, sys, json, datetime
import requests
from pathlib import Path
import urllib.request, urllib.parse

RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
TO_EMAIL       = os.environ.get("SUMMARY_EMAIL")   # your email
FROM_EMAIL     = "Stellara Pipeline <hello@stellara-horoscope.com>"
BASE_DIR       = Path(__file__).parent

SLOT_TIMES = {1: "7:30am", 2: "12:00pm", 3: "7:00pm"}
SLOT_NAMES = {1: "Morning — Your Daily Reading", 2: "Midday — Cosmic Truth", 3: "Evening — Tomorrow's Energy"}


def send_summary(content: dict, out_dir: Path):
    today  = content["date"]
    sign   = content["sign"]
    slots  = content["slots"]

    # ── Build HTML ───────────────────────────────────────────
    slot_html = ""
    for slot in slots:
        n       = slot["slot"]
        caption = slot["caption"].replace("\n", "<br>")
        mp4     = out_dir / f"{slot['filename']}.mp4"
        mp4_note = "✓ MP4 attached" if mp4.exists() else "⚠ MP4 not found"

        slot_html += f"""
        <div style="margin-bottom:36px;padding:24px;background:#132440;border:1px solid rgba(126,168,212,0.2);border-radius:12px;">
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#7ea8d4;margin-bottom:4px;font-family:sans-serif;">
            SLOT {n} &nbsp;·&nbsp; {SLOT_TIMES[n]}
          </div>
          <div style="font-size:17px;font-weight:600;color:#f0f4f8;margin-bottom:16px;font-family:sans-serif;">
            {SLOT_NAMES[n]}
          </div>
          <div style="font-size:14px;color:#d4af37;margin-bottom:12px;font-family:sans-serif;">
            Card text:
          </div>
          <div style="font-size:15px;color:#dce4f0;font-family:Georgia,serif;font-style:italic;
                      background:#0d1b32;padding:16px;border-radius:8px;margin-bottom:16px;line-height:1.7;">
            {slot['card_text']}
          </div>
          <div style="font-size:14px;color:#d4af37;margin-bottom:8px;font-family:sans-serif;">
            Caption (copy &amp; paste):
          </div>
          <div style="font-size:13px;color:#b8c4d8;font-family:monospace;background:#0d1b32;
                      padding:14px;border-radius:8px;line-height:1.8;white-space:pre-wrap;">
{slot['caption']}
          </div>
          <div style="margin-top:12px;font-size:12px;color:#7ea8d4;font-family:sans-serif;">
            {mp4_note}
          </div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0d1b32;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1b32;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:620px;">

        <tr><td style="text-align:center;padding-bottom:28px;">
          <div style="font-size:22px;color:#d4af37;margin-bottom:6px;">✦</div>
          <div style="font-size:11px;letter-spacing:0.25em;color:#d4af37;font-family:sans-serif;text-transform:uppercase;">Stellara Content Pipeline</div>
        </td></tr>

        <tr><td style="text-align:center;padding-bottom:28px;">
          <h1 style="margin:0;font-size:24px;font-weight:400;color:#f0f4f8;">Today's Content Ready</h1>
          <p style="margin:8px 0 0;font-size:13px;color:#8899aa;font-family:sans-serif;">
            {today} &nbsp;·&nbsp; Today's sign: <strong style="color:#d4af37;">{sign}</strong>
          </p>
          <p style="margin:12px 0 0;font-size:13px;color:#8899aa;font-family:sans-serif;">
            Post at <strong style="color:#f0f4f8;">7:30am</strong>,
            <strong style="color:#f0f4f8;">12:00pm</strong>, and
            <strong style="color:#f0f4f8;">7:00pm</strong> — 3 MP4s attached below.
          </p>
        </td></tr>

        <tr><td style="padding-bottom:8px;">
          <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4),transparent);margin-bottom:28px;"></div>
          {slot_html}
        </td></tr>

        <tr><td style="text-align:center;padding-top:8px;">
          <p style="font-size:11px;color:#8899aa;font-family:sans-serif;opacity:0.6;">
            Stellara Content Pipeline · stellara-horoscope.com
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    # ── Send via Resend (no attachments — files are on your Mac) ──
    payload = {
        "from":    FROM_EMAIL,
        "to":      [TO_EMAIL],
        "subject": f"Stellara Content Ready — {today} ({sign} day)",
        "html":    html,
    }

    res = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
        json=payload,
    )
    if not res.ok:
        print(f"Resend error {res.status_code}: {res.text}")
        res.raise_for_status()
    result = res.json()
    print(f"[summary] Sent to {TO_EMAIL} — id: {result.get('id')}")
    return result


def main():
    if not RESEND_API_KEY:
        print("Error: RESEND_API_KEY not set")
        sys.exit(1)
    if not TO_EMAIL:
        print("Error: SUMMARY_EMAIL not set")
        sys.exit(1)

    today   = datetime.date.today()
    out_dir = BASE_DIR / "content" / today.isoformat()
    jp      = out_dir / "content.json"

    if not jp.exists():
        print(f"No content.json at {jp}. Run generate_content.py first.")
        sys.exit(1)

    with open(jp) as f:
        content = json.load(f)

    send_summary(content, out_dir)


if __name__ == "__main__":
    main()
