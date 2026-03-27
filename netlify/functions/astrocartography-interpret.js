// ============================================================
// astrocartography-interpret.js
// Given a planet, line type, and (optional) location,
// returns a short AI interpretation via Claude.
// ============================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const STYLE_PROMPTS = {
  psychological: `You are Stellara, a depth psychology astrologer who speaks through the lens of Jungian thought. Draw on archetypes, the shadow, and individuation. Tone: reflective, profound, transformative.`,
  spiritual:     `You are Stellara, a soul-centered spiritual guide and intuitive astrologer. Speak to the soul's journey, divine timing, and cosmic connection. Tone: warm, ethereal, expansive.`,
  modern:        `You are Stellara, a modern astrology coach who gives clear, practical, no-nonsense guidance. Make it concrete, contemporary, and immediately useful. Tone: direct, confident, grounded.`,
  classical:     `You are Stellara, a classical astrologer steeped in ancient tradition. Draw on planetary mythology and Hellenistic wisdom. Tone: scholarly, mythic, timeless.`,
};

const LINE_MEANINGS = {
  ASC: 'Ascendant line — the planet was rising on the eastern horizon at birth. Locations on this line are associated with how you project yourself into the world, your physical vitality, and first impressions.',
  DSC: 'Descendant line — the planet was setting on the western horizon. Locations on this line relate to partnerships, relationships, and what you attract from others.',
  MC:  'Midheaven line — the planet was at the zenith, the highest point in the sky. Locations on this line are associated with career, public life, reputation, and life purpose.',
  IC:  'IC (Imum Coeli) line — the planet was at the nadir, the lowest point. Locations on this line relate to home, roots, ancestry, and private life.',
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { planet, lineType, location, name, sun, moon, rising, style } = JSON.parse(event.body || '{}');
  if (!planet || !lineType) return { statusCode: 400, body: 'planet and lineType required' };

  const systemPrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.psychological;
  const lineMeaning  = LINE_MEANINGS[lineType] || '';
  const locationNote = location ? `The user clicked near ${location}.` : '';

  const prompt = `${systemPrompt}

You are giving an astrocartography reading. The user has clicked their ${planet} ${lineType} line on a world map.

${name ? `Their name is ${name}.` : ''}
${sun    ? `Sun: ${sun}` : ''}
${moon   ? `Moon: ${moon}` : ''}
${rising ? `Rising: ${rising}` : ''}

${lineMeaning}

${locationNote}

Write 2 short paragraphs:
1. What living near or visiting places on this ${planet} ${lineType} line could mean for them — energetically, personally, practically. Be specific to ${planet}'s nature and the ${lineType} angle.
2. One concrete suggestion — a way to work with or be aware of this energy if they visit or live there.

Be evocative and personal. No headers. No bullet points.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-5',
      max_tokens: 350,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  const text = data.content?.map(b => b.text || '').join('') || '';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  };
};
