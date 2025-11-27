import { NextResponse } from 'next/server';
import { GeminiService } from '@/lib/services/gemini-service';

export async function POST(request: Request) {
  try {
    // Basic security check - in a real app, you might want to require admin authentication
    // For now, we'll just check if the service initializes correctly
    const service = GeminiService.getInstance();
    
    // Parse body if provided, otherwise use default test
    let prompt = "Explain briefly what this platform is based on the name.";
    try {
      const body = await request.json();
      if (body.prompt) {
        prompt = body.prompt;
      }
    } catch (e) {
      // Ignore JSON parse error, use default prompt
    }

    const response = await service.generateContent(prompt);
    
    return NextResponse.json({ 
      success: true, 
      data: response 
    });
  } catch (error: any) {
    console.error('Gemini API Route Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
    try {
        const service = GeminiService.getInstance();
        const result = await service.testConnection();
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

