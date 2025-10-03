
import { GoogleGenAI } from "@google/genai";

// Access the API key from the `window` object, as set by env.js
const API_KEY = (window as any).process.env.API_KEY;

if (!API_KEY || API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
  console.warn("Gemini API Key is not configured. Please add it to env.js. The AI Scripting feature will be disabled.");
}

// Initialize the client only if the key is valid
const ai = (API_KEY && API_KEY !== "YOUR_GEMINI_API_KEY_HERE")
  ? new GoogleGenAI({ apiKey: API_KEY })
  : null;

const SYSTEM_INSTRUCTION = `You are an expert MikroTik network engineer specializing in RouterOS.
Your sole purpose is to generate RouterOS terminal command scripts based on user requests.
Follow these rules strictly:
1. ONLY output the script. Do not provide any conversational text, explanations, greetings, or apologies.
2. The script must be syntactically correct and ready to be pasted directly into a MikroTik terminal.
3. Use best practices for security and efficiency. For example, add comments to complex rules where appropriate.
4. If the user's request is ambiguous, make a reasonable assumption based on common network configurations.
5. If the request is impossible or nonsensical, output a single comment line starting with '#' explaining why. For example: '# Error: Cannot assign a public IP to a local bridge.'`;

export const generateMikroTikScript = async (userPrompt: string): Promise<string> => {
  if (!ai) {
    const errorMessage = "Gemini AI client is not initialized. Please configure your API key in env.js.";
    console.error(errorMessage);
    // Return a user-friendly error message as a comment in the script block
    return Promise.resolve(`# Error: ${errorMessage}`);
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        topP: 0.9,
        topK: 40,
      },
    });

    const script = response.text.trim();
    
    // Clean up potential markdown code block formatting
    return script.replace(/^```(routeros|bash|sh)?\s*|```$/g, '').trim();
  } catch (error) {
    console.error("Error generating script from Gemini API:", error);
    throw new Error("Failed to communicate with the AI service. Check your API key and internet connection.");
  }
};