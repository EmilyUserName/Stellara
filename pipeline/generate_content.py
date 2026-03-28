#!/usr/bin/env python3
"""
generate_content.py
Generates all three daily content pieces for Stellara's TikTok/Instagram pipeline.
Outputs a JSON file to content/YYYY-MM-DD/content.json
"""

import os
import json
import datetime
import anthropic

# ------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------
SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer",
    "Leo", "Virgo", "Libra", "Scorpio",
    "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

SIGN_SYMBOLS = {
    "Aries": "♈", "Taurus": "♉", "Gemini": "♊", "Cancer": "♋",
    "Leo": "♌", "Virgo": "♍", "Libra": "♎", "Scorpio": "♏",
    "Sagittarius": "♐", "Capricorn": "♑", "Aquarius": "♒", "Pisces": "♓"
}

SIGN_HASHTAGS = {
    "Aries": "#aries", "Taurus": "#taurus", "Gemini": "#gemini",
    "Cancer": "#cancer", "Leo": "#leo", "Virgo": "#virgo",
    "Libra": "#libra", "Scorpio": "#scorpio", "Sagittarius": "#sagittarius",
    "Capricorn": "#capricorn", "Aquarius": "#aquarius", "Pisces": "#pisces"
}

CLIENT = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------
def get_todays_sign(date: datetime.date) -> str:
    """Rotate through all 12 signs based on day of year."""
    day_of_year = date.timetuple().tm_yday
    return SIGNS[(day_of_year - 1) % 12]


def ask_claude(prompt: str) -> str:
    message = CLIENT.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text.strip()


# ------------------------------------------------------------
# SLOT 1 — Daily Reading (sign-specific horoscope)
# ------------------------------------------------------------
def generate_slot1(sign: str, date: datetime.date) -> dict:
    symbol   = SIGN_SYMBOLS[sign]
    date_str = date.strftime("%B %d, %Y")

    prompt = f"""You are Stellara, a mystical and modern astrology brand on TikTok and Instagram.

Write a daily horoscope for {sign} for {date_str}.

Rules:
- 2-3 sentences only. Mystical but grounded. Personal and direct.
- Start with a strong hook — something that makes them stop scrolling.
- Do NOT start with "{sign}," or the sign name. Start mid-thought or with an action/feeling.
- No hashtags, no emojis, no line breaks. Plain sentences only.
- Make it feel like a message meant just for them.

Return only the horoscope text. Nothing else."""

    reading = ask_claude(prompt)

    sign_tag = SIGN_HASHTAGS[sign]
    caption = f"""{symbol} {sign}, the universe has a message for you today...

{reading}

✨ Get your full birth chart at stellara-horoscope.com
{sign_tag} #dailyhoroscope #horoscopetok #astrologytok #astrology #zodiac #zodiaccheck #spiritualtok #witchtok"""

    return {
        "slot": 1,
        "type": "daily_reading",
        "sign": sign,
        "symbol": symbol,
        "date": date_str,
        "card_text": reading,
        "caption": caption,
        "filename": f"stellara_daily_{sign.lower()}_{date.isoformat()}"
    }


# ------------------------------------------------------------
# SLOT 2 — Cosmic Truth (shareable bold statement)
# ------------------------------------------------------------
def generate_slot2(date: datetime.date) -> dict:
    prompt = """You are Stellara, a mystical and modern astrology brand on TikTok and Instagram.

Write one bold, shareable astrology truth. This is the type of post people screenshot and send to friends.

Rules:
- One sentence or two short sentences max.
- Slightly provocative or painfully accurate — about a sign, a planet, or a universal truth.
- Examples of the tone:
  "Scorpios don't forgive easily. They just decide if you're worth the energy."
  "Mercury retrograde doesn't ruin your life. It just reveals what was already broken."
  "Your rising sign is who the world sees. Your moon sign is who you are at 3am."
- Vary the subject — don't always write about Scorpio. Mix signs, planets, chart placements.
- No hashtags, no emojis. Plain text only.

Return only the statement. Nothing else."""

    truth = ask_claude(prompt)

    caption = f"""{truth}

Know your full chart → stellara-horoscope.com
#astrology #zodiac #horoscopetok #astrologytok #spiritualtok #witchtok #zodiacfacts #astrologytiktok"""

    return {
        "slot": 2,
        "type": "cosmic_truth",
        "date": date.isoformat(),
        "card_text": truth,
        "caption": caption,
        "filename": f"stellara_truth_{date.isoformat()}"
    }


# ------------------------------------------------------------
# SLOT 3 — Tomorrow's Energy (planetary preview)
# ------------------------------------------------------------
def generate_slot3(date: datetime.date) -> dict:
    tomorrow     = date + datetime.timedelta(days=1)
    tomorrow_str = tomorrow.strftime("%B %d, %Y")

    prompt = f"""You are Stellara, a mystical and modern astrology brand on TikTok and Instagram.

Write a short cosmic energy preview for {tomorrow_str}.

Rules:
- 1-2 sentences. Atmospheric and intriguing — make people want to tune in tomorrow.
- Reference a real or plausible planetary event (Moon sign shift, planetary ingress, aspect).
- Be specific — name the planet and sign. Don't be vague.
- Examples:
  "Tomorrow, Mars enters Gemini. If you've been holding back — don't."
  "The Moon moves into Scorpio tomorrow. Emotions will run deep. Let them."
  "Venus squares Saturn tomorrow. Love gets honest whether you're ready or not."
- No hashtags, no emojis. Plain text only.

Return only the preview text. Nothing else."""

    preview = ask_claude(prompt)

    caption = f"""Follow so you don't miss your reading tomorrow ✨

{preview}

Full chart readings at stellara-horoscope.com
#tomorrowshoroscope #dailyhoroscope #astrology #horoscopetok #zodiac #astrologytok #cosmicenergy #spiritualtok"""

    return {
        "slot": 3,
        "type": "tomorrows_energy",
        "date": tomorrow_str,
        "card_text": preview,
        "caption": caption,
        "filename": f"stellara_tomorrow_{date.isoformat()}"
    }


# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------
def main():
    today = datetime.date.today()
    sign  = get_todays_sign(today)

    print(f"[generate] Date: {today} | Today's sign: {sign}")

    print("[generate] Generating Slot 1 — Daily Reading...")
    slot1 = generate_slot1(sign, today)

    print("[generate] Generating Slot 2 — Cosmic Truth...")
    slot2 = generate_slot2(today)

    print("[generate] Generating Slot 3 — Tomorrow's Energy...")
    slot3 = generate_slot3(today)

    output = {
        "date":      today.isoformat(),
        "sign":      sign,
        "generated": datetime.datetime.utcnow().isoformat() + "Z",
        "slots":     [slot1, slot2, slot3]
    }

    # Save to content/YYYY-MM-DD/content.json
    out_dir = os.path.join(os.path.dirname(__file__), "content", today.isoformat())
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "content.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"[generate] Saved to {out_path}")
    print(f"\n--- SLOT 1 ---\n{slot1['card_text']}")
    print(f"\n--- SLOT 2 ---\n{slot2['card_text']}")
    print(f"\n--- SLOT 3 ---\n{slot3['card_text']}")

    return output


if __name__ == "__main__":
    main()
