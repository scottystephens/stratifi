import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

export class GeminiService {
  private static instance: GeminiService;
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  private constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    // using gemini-2.0-flash as a good default balance of speed and capability
    // (verified available: gemini-2.0-flash, gemini-2.5-flash, gemini-flash-latest)
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }

  public static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService();
    }
    return GeminiService.instance;
  }

  public async generateContent(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      throw new Error(`Failed to generate content: ${error.message}`);
    }
  }

  /**
   * useful for testing connection status
   */
  public async testConnection(): Promise<{ success: boolean; message: string; timestamp: string }> {
    try {
      const prompt = "Reply with 'OK'";
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return {
        success: true,
        message: text,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export const geminiService = GeminiService.getInstance();

