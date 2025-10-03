
import { GoogleGenAI } from "@google/genai";

// Fix: Initialize the GoogleGenAI client directly with the API key from the environment variable as per guidelines.
// It is assumed that process.env.API_KEY is properly configured in the execution environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `You are an expert MikroTik network engineer specializing in RouterOS.
Your sole purpose is to generate RouterOS terminal command scripts based on user requests.
Follow these rules strictly:
1. ONLY output the script. Do not provide any conversational text, explanations, greetings, or apologies.
2. The script must be syntactically correct and ready to be pasted directly into a MikroTik terminal.
3. Use best practices for security and efficiency. For example, add comments to complex rules where appropriate.
4. If the user's request is ambiguous, make a reasonable assumption based on common network configurations.
5. If the request is impossible or nonsensical, output a single comment line starting with '#' explaining why. For example: '# Error: Cannot assign a public IP to a local bridge.'`;

export const generateMikroTikScript = async (userPrompt: string): Promise<string> => {
  // Fix: Removed conditional client initialization. The client is now always initialized.
  // The try-catch block will handle any issues with the API key or network at runtime.
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

    // Fix: Directly access the 'text' property on the response as per guidelines.
    const script = response.text.trim();
    
    // Clean up potential markdown code block formatting
    return script.replace(/^```(routeros|bash|sh)?\s*|```$/g, '').trim();
  } catch (error) {
    console.error("Error generating script from Gemini API:", error);
    // Fix: Improved error handling to return a user-friendly message within the script block.
    // This avoids throwing an unhandled exception in the UI.
    if (error instanceof Error && error.message.includes('API key not valid')) {
        return `# Error: Invalid Gemini API Key. Please ensure it is configured correctly in your environment.`;
    }
    return `# Error: Failed to communicate with the AI service. Check your internet connection and API key.`;
  }
};
