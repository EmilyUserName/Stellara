#!/usr/bin/env python3
"""
setup_music.py
One-time script to download 5 royalty-free ambient/cosmic music tracks from Pixabay.
Run once to populate pipeline/music/ — tracks are then committed to the repo.
"""

import os
import sys
import urllib.request
import urllib.parse
import json

PIXABAY_API_KEY = os.environ.get("PIXABAY_API_KEY")
if not PIXABAY_API_KEY:
    print("Error: PIXABAY_API_KEY environment variable not set.")
    sys.exit(1)

MUSIC_DIR = os.path.join(os.path.dirname(__file__), "music")
os.makedirs(MUSIC_DIR, exist_ok=True)

SEARCHES = ["ambient space", "cosmic meditation", "mystical", "ethereal", "celestial"]

def search_and_download(query: str, index: int):
    params = urllib.parse.urlencode({
        "key":        PIXABAY_API_KEY,
        "q":          query,
        "media_type": "music",
        "per_page":   3,
    })
    url = f"https://pixabay.com/api/videos/?{params}"

    with urllib.request.urlopen(url) as res:
        data = json.loads(res.read())

    hits = data.get("hits", [])
    if not hits:
        print(f"  No results for '{query}' — skipping.")
        return False

    # Pick the first result that has an audio URL
    for hit in hits:
        audio_url = hit.get("videos", {}).get("medium", {}).get("url") or hit.get("userImageURL")
        # Pixabay music hits have a direct audio URL in the tags
        tags = hit.get("tags", "")
        music_url = None

        # The music API returns audio download links differently — try the direct approach
        hit_id  = hit.get("id")
        hit_url = f"https://cdn.pixabay.com/audio/2023/01/01/audio_{hit_id}.mp3"

        # Use pageURL as fallback reference
        print(f"  Found: '{hit.get('tags', '')}' by {hit.get('user', 'unknown')}")
        print(f"  Page: {hit.get('pageURL', '')}")
        break

    print(f"  Note: Pixabay music requires manual download from the page above.")
    return False


def download_file(url: str, dest: str) -> bool:
    try:
        print(f"  Downloading {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "Stellara/1.0"})
        with urllib.request.urlopen(req) as res, open(dest, "wb") as f:
            f.write(res.read())
        size = os.path.getsize(dest)
        if size < 1000:
            os.remove(dest)
            return False
        print(f"  Saved {os.path.basename(dest)} ({size // 1024}KB)")
        return True
    except Exception as e:
        print(f"  Failed: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        return False


def main():
    print("[setup_music] Searching Pixabay for ambient/cosmic tracks...\n")

    params = urllib.parse.urlencode({
        "key":      PIXABAY_API_KEY,
        "q":        "ambient",
        "per_page": 20,
        "order":    "popular",
    })
    url = f"https://pixabay.com/api/videos/?{params}"

    with urllib.request.urlopen(url) as res:
        data = json.loads(res.read())

    hits = data.get("hits", [])
    if not hits:
        print("No results found. Check your API key.")
        sys.exit(1)

    downloaded = 0
    for hit in hits:
        if downloaded >= 5:
            break

        page_url = hit.get("pageURL", "")
        tags     = hit.get("tags", "")
        user     = hit.get("user", "unknown")
        hit_id   = hit.get("id")

        # Try common Pixabay CDN audio URL patterns
        for pattern in [
            f"https://cdn.pixabay.com/audio/{hit_id}/audio_{hit_id}.mp3",
            f"https://cdn.pixabay.com/download/audio/2024/01/01/audio_{hit_id}.mp3",
        ]:
            dest = os.path.join(MUSIC_DIR, f"track_{downloaded + 1:02d}.mp3")
            if download_file(pattern, dest):
                downloaded += 1
                break
        else:
            print(f"  Could not auto-download '{tags}' — visit manually: {page_url}")

    if downloaded == 0:
        print("\nPixabay's CDN URLs require knowing the exact upload date.")
        print("Please download 3-5 tracks manually from pixabay.com/music/")
        print("Search 'ambient space' or 'cosmic meditation', download as MP3,")
        print(f"and save them to: {MUSIC_DIR}")
    else:
        print(f"\n[setup_music] Downloaded {downloaded} tracks to {MUSIC_DIR}")


if __name__ == "__main__":
    main()
