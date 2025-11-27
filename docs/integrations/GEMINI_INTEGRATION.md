# Gemini AI Integration

Stratiri integrates with Google's Gemini AI models via the `GoogleGenerativeAI` SDK. This integration enables intelligent features such as data analysis, categorization, and natural language query processing.

## Configuration

The integration relies on the `GEMINI_API_KEY` environment variable.

### Environment Variables
```env
GEMINI_API_KEY=AIzaSy...
```

### Supported Models
The service is currently configured to use `gemini-2.0-flash` by default for optimal balance between speed and performance.
(Verified models include `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-flash-latest`).

## Architecture

The integration is managed through a singleton service class:
`lib/services/gemini-service.ts`

### Usage

```typescript
import { GeminiService } from '@/lib/services/gemini-service';

// Get the instance
const gemini = GeminiService.getInstance();

// Generate content
const response = await gemini.generateContent("Analyze this transaction...");
```

### Testing

A test API route is available at `/api/ai/test`.
- **GET**: specific connection test (returns simple "OK" check).
- **POST**: accepts `{ "prompt": "..." }` to test generation.

## Future Plans

- Transaction categorization using AI
- Natural language query for bank data ("Show me all expenses over $500 last month")
- Anomaly detection in financial patterns

