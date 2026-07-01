import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;

// Shared Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API endpoint for Smart Timer planning
app.post('/api/smart-timer/plan', async (req: any, res: any) => {
  try {
    const { subject, goal, duration } = req.body;
    if (!subject || !goal || !duration) {
      return res.status(400).json({ error: 'Subject, goal, and duration are required.' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
      console.warn('GEMINI_API_KEY is not configured. Falling back to structured simulation plan.');
      // Return a graceful mock plan if key is not configured yet
      const fallbackPlan = {
        milestones: [
          { name: `Review Core: ${subject}`, duration: Math.max(5, Math.floor(duration * 0.3)), notes: `Revise fundamental rules and theory concerning: ${goal}.` },
          { name: `Active Application & Practice`, duration: Math.floor(duration * 0.5), notes: `Work on challenging problems and code implementation for: ${goal}.` },
          { name: `Synthesis & Summary`, duration: Math.max(5, Math.floor(duration * 0.2)), notes: `Log key formulas, create memory cues, and prepare for review.` }
        ]
      };
      // Make sure the sum of durations matches exactly the duration
      const currentSum = fallbackPlan.milestones.reduce((acc, m) => acc + m.duration, 0);
      const diff = duration - currentSum;
      if (diff !== 0) {
        fallbackPlan.milestones[1].duration += diff; // adjust main practice milestone to absorb rounding
      }
      return res.json(fallbackPlan);
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `You are an expert focus coach and academic success advisor.
Break down a study session of ${duration} minutes for the subject "${subject}" with the target goal: "${goal}" into an optimized, milestone-based study plan.
Deconstruct this into 3 to 5 realistic, sequential milestones that sum up to EXACTLY ${duration} minutes.
Format your response as a valid, pure JSON object containing a "milestones" array where each milestone has a "name" (brief specific name), a "duration" (integer number of minutes, which must sum up to exactly ${duration}), and "notes" (practical guidance).
Schema:
{
  "milestones": [
    {
      "name": "string",
      "duration": number,
      "notes": "string"
    }
  ]
}`,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response received from Gemini.');
    }
    const data = JSON.parse(text.trim());
    
    // Safety check on durations to make sure they sum up to duration
    if (data && data.milestones && Array.isArray(data.milestones)) {
      const sum = data.milestones.reduce((acc: number, m: any) => acc + (Number(m.duration) || 0), 0);
      if (sum !== duration && data.milestones.length > 0) {
        const diff = duration - sum;
        data.milestones[data.milestones.length - 1].duration += diff; // adjust last milestone
      }
    }

    res.json(data);
  } catch (error: any) {
    console.error('Error generating study plan:', error);
    res.status(500).json({ error: error.message || 'Failed to generate study plan.' });
  }
});

// Serve static assets or run Vite dev server
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  
  // Serve index.html for any requested path (SPA fallback)
  app.get('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = await vite.transformIndexHtml(url, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Study Hour Tracker</title>
  </head>
  <body class="bg-slate-50 text-slate-800">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
} else {
  // Serve static assets in production
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Study Hour Tracker Full-Stack Server running at http://0.0.0.0:${PORT}`);
});
