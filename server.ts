import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import wisdomData from "./wisdom.json";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  const PORT = 3000;

  // Gemini STT (Speech-to-Text) Proxy
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) return res.status(400).json({ error: "Missing audio data" });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { text: "Transcribe the following audio exactly as spoken. Return only the transcribed text, nothing else. If no clear speech is found, return an empty string." },
          {
            inlineData: {
              mimeType: mimeType || "audio/webm",
              data: audioBase64.split(',')[1] || audioBase64
            }
          }
        ],
      });

      res.json({ text: response.text?.trim() || "" });
    } catch (error: any) {
      console.error("STT Error:", error);
      if (error.message?.includes('quota') || error.status === 429) {
        return res.status(429).json({ error: "Quota exceeded for speech-to-text. Please wait a moment." });
      }
      res.status(500).json({ error: "Speech transcription failed." });
    }
  });

  // Gemini TTS (Text-to-Speech) Proxy
  app.post("/api/speak", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "Missing text" });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) throw new Error("No audio data returned from Gemini");

      res.json({ audioBase64: audioData });
    } catch (error: any) {
      console.error("TTS Error:", error);
      if (error.message?.includes('quota') || error.status === 429) {
        return res.status(429).json({ error: "Quota exceeded for text-to-speech. Please wait a moment." });
      }
      res.status(500).json({ error: "Speech generation failed." });
    }
  });

  // Simple Semantic Search (Vector simulation for Hackathon)
  // In a real app, this would use pgvector
  async function findRelatedWisdom(userInput: string) {
    // We'll use Gemini to select the most relevant verse using the rich metadata
    // We pass themes, tags, and meanings to help the AI match better.
    const verseMetadata = wisdomData.verses.map(v => ({
      id: v.id,
      meaning: v.simpleMeaning,
      themes: v.emotionalThemes,
      situations: v.practicalSituations,
      tags: v.emotionalTags
    }));
    
    const prompt = `Based on the user's emotional state or problem: "${userInput}", select the most relevant verse from this wisdom dataset. 
    Look at the 'themes', 'situations', and 'tags' to find the best match for their specific struggle.
    
    Return ONLY the ID of the verse (e.g., 2.47).
    
    Dataset Context:
    ${JSON.stringify(verseMetadata)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const selectedId = response.text?.trim().match(/\d+\.\d+/)?.[0];
    return wisdomData.verses.find(v => v.id === selectedId) || wisdomData.verses[0];
  }

  app.post("/api/mood-sync", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "No visual data" });

      const visualPrompt = `
        Analyze this person's facial expression, micro-expressions, and posture.
        1. Identify their primary emotional state (e.g., Sad, Stressed, Neutral, Joyful, Anxious).
        2. Provide 3 extremely brief, practical "cheer-up" or "grounding" suggestions.
        3. Give a short, compassionate one-line validation of their current state.

        Return as JSON:
        {
          "detectedMood": "string",
          "intent": "string",
          "suggestions": ["string", "string", "string"],
          "validation": "string"
        }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { text: visualPrompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64.split(',')[1] || imageBase64
            }
          }
        ],
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (error: any) {
      console.error("Mood sync error:", error);
      if (error.message?.includes('quota') || error.status === 429 || error.message?.includes('429')) {
        return res.status(429).json({ error: "The sync is resting. (API Quota Exceeded)" });
      }
      res.status(500).json({ error: "Sync failed: " + (error.message || "Unknown error") });
    }
  });

  app.post("/api/reflect", async (req, res) => {
    try {
      const { problem, imageBase64 } = req.body;
      
      const verseMetadata = wisdomData.verses.map(v => ({
        id: v.id,
        meaning: v.simpleMeaning,
        themes: v.emotionalThemes,
        situations: v.practicalSituations,
      }));

      // Consolidation: We do analysis, wisdom selection, and reflection in ONE call.
      const multiPrompt = `
        User Input: "${problem}"
        
        Task 1: Content Analysis
        - Detect primary emotions & intensities (0-1).
        - Detect overall sentiment (score -1 to 1).
        - Categorize into themes: stress, anxiety, anger, fear, confusion, loneliness, purpose, failure.
        
        Task 2: Wisdom Selection
        - From this dataset: ${JSON.stringify(verseMetadata)}
        - Select the most relevant verse ID that matches the user's struggle.
        
        Task 3: Deep Reflection
        - Contrast 'Impulsive Path' vs 'Dharmic Path'.
        - Style: Extremely short, crisp, layman terms.
        
        ${imageBase64 ? "Task 4: Visual Analysis - Analyze facial features for micro-expressions and posture to refine the emotional insight." : ""}

        Return ONLY JSON:
        {
          "analysis": {
            "emotions": [{ "name": string, "intensity": number, "theme": string }],
            "sentiment": { "score": number, "label": string },
            "visualSummary": "string (if image provided)"
          },
          "selectedVerseId": "string",
          "reflection": "string",
          "consequences": { "shortTerm": "string", "longTerm": "string" },
          "advice": "string",
          "moodReflection": "string"
        }`;

      const contents: any[] = [{ text: multiPrompt }];
      if (imageBase64) {
        contents.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64.split(',')[1] || imageBase64
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: { responseMimeType: "application/json" }
      });
      
      const data = JSON.parse(response.text || "{}");
      const relevantWisdom = wisdomData.verses.find(v => v.id === data.selectedVerseId) || wisdomData.verses[0];

      res.json({
        emotions: data.analysis?.emotions || [],
        sentiment: data.analysis?.sentiment || { score: 0, label: "Neutral" },
        visualInsights: data.analysis?.visualSummary || "",
        wisdom: relevantWisdom,
        reflection: data.reflection,
        consequences: data.consequences,
        advice: data.advice,
        moodReflection: data.moodReflection
      });

    } catch (error: any) {
      console.error("Error in reflection API:", error);
      
      if (error.message?.includes('quota') || error.status === 429 || error.message?.includes('429')) {
        return res.status(429).json({ 
          error: "The well of wisdom is temporarily dry. (API Quota Exceeded)",
          message: "The system is currently resting due to high demand. Please try again in about 60 seconds. You can select a paid API key in Settings > Secrets for higher limits."
        });
      }

      res.status(500).json({ 
        error: "Internal Server Error",
        message: "The reflection process was interrupted. Please check your internet connection and try again."
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
