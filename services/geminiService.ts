import { GoogleGenAI, Type } from "@google/genai";
import type { AIFixResponse } from '../types.ts';

// Fix: Initialize the GoogleGenAI client directly with the API key from the environment variable as per guidelines.
// It is assumed that process.env.API_KEY is properly configured in the execution environment.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SCRIPT_SYSTEM_INSTRUCTION = `You are an expert MikroTik network engineer specializing in RouterOS.
Your sole purpose is to generate RouterOS terminal command scripts based on user requests.
Follow these rules strictly:
1. ONLY output the script. Do not provide any conversational text, explanations, greetings, or apologies.
2. The script must be syntactically correct and ready to be pasted directly into a MikroTik terminal.
3. Use best practices for security and efficiency. For example, add comments to complex rules where appropriate.
4. If the user's request is ambiguous, make a reasonable assumption based on common network configurations.
5. If the request is impossible or nonsensical, output a single comment line starting with '#' explaining why. For example: '# Error: Cannot assign a public IP to a local bridge.'`;

const FIXER_SYSTEM_INSTRUCTION = `You are an expert full-stack developer with deep knowledge of Node.js, Express.js, and the MikroTik REST API.
Your task is to act as an automated debugger and code fixer.
You will be given the full source code of a Node.js backend file, the error message the user sees in the frontend, and the name of the MikroTik router they are connected to.
Your goal is to identify the bug in the provided code that is causing the error, fix it, and provide the complete, corrected file content.

RULES:
1. Analyze the error message in the context of the provided code. The error is likely related to how the code communicates with the MikroTik router via its REST API.
2. Common bugs include: incorrect API endpoints (e.g., /system/routerboard on a CHR), mishandling of MikroTik's 'kebab-case' property names, race conditions from using 'Promise.all', or incorrect data mapping that causes frontend display issues.
3. Provide a brief, clear explanation of the bug you found and how your fix resolves it. Keep it concise (2-3 sentences).
4. Provide the *entire*, complete, corrected code for the file. Do not use placeholders or omit sections. The user will replace their entire file with your output.
5. Your final output MUST be a JSON object matching the provided schema. Do not add any conversational text or markdown formatting outside of the JSON object.`;


export const generateMikroTikScript = async (userPrompt: string): Promise<string> => {
  // Fix: Removed conditional client initialization. The client is now always initialized.
  // The try-catch block will handle any issues with the API key or network at runtime.
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: SCRIPT_SYSTEM_INSTRUCTION,
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


export const fixBackendCode = async (backendCode: string, errorMessage: string, routerName: string): Promise<AIFixResponse> => {
    try {
        const userPrompt = `The user is seeing the error "${errorMessage}" when connected to a router named "${routerName}". Please analyze and fix the following backend code:\n\n\`\`\`javascript\n${backendCode}\n\`\`\``;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: userPrompt,
            config: {
                systemInstruction: FIXER_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        explanation: {
                            type: Type.STRING,
                            description: "A brief, clear explanation of the bug and the fix.",
                        },
                        fixedCode: {
                            type: Type.STRING,
                            description: "The complete, corrected source code for the entire file.",
                        },
                    },
                    required: ["explanation", "fixedCode"],
                },
            },
        });

        const jsonString = response.text.trim();
        return JSON.parse(jsonString) as AIFixResponse;
    } catch (error) {
        console.error("Error generating code fix from Gemini API:", error);
        throw new Error("Failed to communicate with the AI service to get a fix.");
    }
};