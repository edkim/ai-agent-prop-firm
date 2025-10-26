# Chart-to-Prompt Generation Feature - 2025-10-23

## Status: 📋 PLANNED FOR FUTURE IMPLEMENTATION

## Overview
Add image upload capability that uses Claude's vision API to analyze trading chart screenshots and automatically generate natural language backtest prompts based on observed price action, patterns, and trading setups.

## User Requirements (From Discovery)
- **Analysis Type**: Price action description (entry/exit conditions, support/resistance, observable behavior)
- **Upload Method**: File upload in frontend UI (drag & drop or file picker)
- **Output Behavior**: Show generated prompt for user review/editing before execution

## User Flow

### 1. Upload Chart
```
User visits backtest form
  → Clicks "Upload Chart" or drags image into drop zone
  → Image preview appears with file details (name, size)
  → "Analyze Chart" button becomes active
```

### 2. Analysis
```
User clicks "Analyze Chart"
  → Loading spinner with "Claude is analyzing your chart..."
  → Backend sends image to Claude Vision API
  → Claude analyzes price action, patterns, key levels
  → Returns natural language strategy description
```

### 3. Review & Edit
```
Generated prompt appears in editable textarea
  → User can review Claude's interpretation
  → User can edit/refine the prompt
  → Shows Claude's confidence score (0.0-1.0)
  → Shows key observations bullet list
  → "Use This Prompt" button to populate main form
```

### 4. Execute
```
User clicks "Run Backtest"
  → Existing intelligent backtest system takes over
  → Prompt goes through standard routing (template/Claude-generated)
  → Results displayed as normal
```

## Technical Architecture

### Backend Implementation

#### 1. Dependencies
```bash
npm install --save multer @types/multer
```

**Purpose**:
- `multer`: Handle multipart/form-data file uploads
- Temporary file storage before processing

#### 2. New Service: `ChartAnalyzerService`

**File**: `backend/src/services/chart-analyzer.service.ts`

**Key Method**:
```typescript
async analyzeChart(imageBuffer: Buffer, mimeType: string): Promise<{
  prompt: string;
  confidence: number;
  observations: string[];
  detectedElements: string[];
}>;
```

**Implementation Details**:
- Convert buffer to base64 for Claude API
- Use Claude Vision API (model: claude-sonnet-4-5-20250929)
- System prompt focused on price action analysis
- Parse Claude's response to extract prompt and metadata

**System Prompt Strategy**:
```
You are a trading strategy analyst specializing in chart pattern recognition and price action analysis.

Analyze this trading chart image and generate a detailed backtest prompt describing the strategy or setup shown.

Focus on identifying:
1. Entry Conditions
   - Price action signals (breakouts, pullbacks, reversals)
   - Key price levels (support, resistance, pivot points)
   - Volume patterns if visible
   - Timeframe context

2. Exit Conditions
   - Profit targets (fixed percentage, key levels, trailing)
   - Stop loss placement (fixed, ATR-based, swing points)
   - Time-based exits if applicable

3. Risk Management
   - Position sizing hints
   - Risk/reward ratio if observable
   - Multiple entry/exit scenarios

4. Market Context
   - Trend direction (uptrend, downtrend, range)
   - Volatility characteristics
   - Session/time of day if identifiable

Generate a natural language prompt suitable for backtesting this strategy. Be specific about entry/exit conditions, but acknowledge any assumptions you're making.

Respond in this format:
PROMPT: [The backtest prompt]
CONFIDENCE: [0.0-1.0]
OBSERVATIONS:
- [Key observation 1]
- [Key observation 2]
...
DETECTED_ELEMENTS:
- [Candlesticks/Line chart/etc]
- [Indicators visible: SMA, VWAP, etc]
- [Chart timeframe if identifiable]
```

#### 3. New API Route: `chart-analysis.ts`

**File**: `backend/src/api/routes/chart-analysis.ts`

**Endpoint**: `POST /api/charts/analyze`

**Request**:
```typescript
Content-Type: multipart/form-data
{
  chart: File (PNG, JPG, JPEG)
}
```

**Response**:
```typescript
{
  success: boolean;
  prompt: string;
  confidence: number;
  observations: string[];
  detectedElements: string[];
  metadata: {
    fileSize: number;
    mimeType: string;
    imageWidth: number;
    imageHeight: number;
  };
}
```

**Validation**:
- File size: Max 10MB
- MIME types: image/png, image/jpeg, image/jpg
- Image dimensions: Min 400x300 pixels
- Rate limiting: 10 requests per minute per IP

**Implementation**:
```typescript
import express from 'express';
import multer from 'multer';
import { ChartAnalyzerService } from '../../services/chart-analyzer.service';

const router = express.Router();
const chartAnalyzer = new ChartAnalyzerService();

// Configure multer for memory storage (no disk I/O)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG and JPEG allowed.'));
    }
  },
});

router.post('/analyze', upload.single('chart'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const result = await chartAnalyzer.analyzeChart(
      req.file.buffer,
      req.file.mimetype
    );

    res.json({
      success: true,
      ...result,
      metadata: {
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
```

#### 4. Update Server Configuration

**File**: `backend/src/api/server.ts`

**Changes**:
```typescript
import chartAnalysisRoutes from './routes/chart-analysis';

// Add route
app.use('/api/charts', chartAnalysisRoutes);
```

#### 5. New Type Definitions

**File**: `backend/src/types/chart.types.ts`

```typescript
export interface ChartAnalysisResponse {
  prompt: string;
  confidence: number;
  observations: string[];
  detectedElements: string[];
}

export interface ChartAnalysisMetadata {
  fileSize: number;
  mimeType: string;
  imageWidth?: number;
  imageHeight?: number;
  processingTime?: number;
}
```

### Frontend Implementation

#### 1. New Component: `ChartUpload`

**File**: `frontend/src/components/ChartUpload.tsx`

**Features**:
- Drag & drop zone with visual feedback
- File picker fallback (click to browse)
- Image preview with clear/replace options
- "Analyze Chart" button
- Loading state with spinner
- Error handling with retry
- Result display (prompt, confidence, observations)

**Component Structure**:
```tsx
interface ChartUploadProps {
  onPromptGenerated: (prompt: string, metadata: ChartAnalysisResponse) => void;
}

export default function ChartUpload({ onPromptGenerated }: ChartUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ChartAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drag & drop handlers
  const handleDrop = (e: DragEvent) => { /* ... */ };
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => { /* ... */ };

  // Analysis
  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const response = await api.analyzeChart(file!);
      setResult(response);
      // User can review before using
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUsePrompt = () => {
    if (result) {
      onPromptGenerated(result.prompt, result);
    }
  };

  return (
    <div className="chart-upload">
      {/* Drop zone */}
      {/* Preview */}
      {/* Analysis button */}
      {/* Loading spinner */}
      {/* Results display */}
      {/* Error display */}
    </div>
  );
}
```

**UI Design**:
```
┌─────────────────────────────────────────────┐
│  📊 Upload Chart to Generate Strategy       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌────────────────────────────────────┐    │
│  │                                    │    │
│  │    Drop chart image here          │    │
│  │    or click to browse             │    │
│  │                                    │    │
│  │    Supported: PNG, JPG (max 10MB) │    │
│  │                                    │    │
│  └────────────────────────────────────┘    │
│                                             │
│  [Preview Image Here Once Selected]        │
│                                             │
│  [Analyze Chart Button]                    │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │ Generated Prompt:                  │    │
│  │ ┌────────────────────────────────┐ │    │
│  │ │ [Editable textarea]            │ │    │
│  │ │                                │ │    │
│  │ └────────────────────────────────┘ │    │
│  │                                    │    │
│  │ Confidence: 85%                    │    │
│  │                                    │    │
│  │ Key Observations:                  │    │
│  │ • Bullish breakout above resistance│    │
│  │ • Volume spike on breakout         │    │
│  │ • Clear support at $28.50          │    │
│  │                                    │    │
│  │ [Use This Prompt]                  │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

#### 2. Update Backtest Form

**File**: `frontend/src/components/BacktestForm.tsx`

**Changes**:
- Add "Upload Chart" collapsible section or tab
- Integrate ChartUpload component
- Populate prompt textarea when user clicks "Use This Prompt"
- Show badge indicating prompt was AI-generated from chart
- Store chart analysis metadata for display in results

**Integration**:
```tsx
const [chartGeneratedPrompt, setChartGeneratedPrompt] = useState<string | null>(null);
const [chartMetadata, setChartMetadata] = useState<ChartAnalysisResponse | null>(null);

const handleChartPromptGenerated = (prompt: string, metadata: ChartAnalysisResponse) => {
  setChartGeneratedPrompt(prompt);
  setChartMetadata(metadata);
  // Populate the main prompt textarea
  setPrompt(prompt);
};

return (
  <form>
    {/* Existing form fields */}

    <div className="chart-upload-section">
      <h3>Or Upload a Chart</h3>
      <ChartUpload onPromptGenerated={handleChartPromptGenerated} />
    </div>

    {chartGeneratedPrompt && (
      <div className="badge badge-info">
        📊 Prompt generated from chart (Confidence: {chartMetadata?.confidence}%)
      </div>
    )}

    {/* Rest of form */}
  </form>
);
```

#### 3. API Client Updates

**File**: `frontend/src/services/api.ts`

**New Method**:
```typescript
export interface ChartAnalysisResponse {
  prompt: string;
  confidence: number;
  observations: string[];
  detectedElements: string[];
  metadata: {
    fileSize: number;
    mimeType: string;
  };
}

export const analyzeChart = async (file: File): Promise<ChartAnalysisResponse> => {
  const formData = new FormData();
  formData.append('chart', file);

  const response = await fetch(`${API_BASE_URL}/api/charts/analyze`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - browser will set it with boundary
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to analyze chart');
  }

  const data = await response.json();
  return data;
};
```

## Claude Vision API Integration

### Code Example

```typescript
import Anthropic from '@anthropic-ai/sdk';

export class ChartAnalyzerService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async analyzeChart(imageBuffer: Buffer, mimeType: string): Promise<ChartAnalysisResponse> {
    const base64Image = imageBuffer.toString('base64');

    // Validate MIME type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(mimeType)) {
      throw new Error('Invalid image type');
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      temperature: 0.2, // Lower for more consistent analysis
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/png' | 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: 'Analyze this trading chart and generate a backtest prompt. Follow the format specified in your system instructions.',
            },
          ],
        },
      ],
      system: this.buildSystemPrompt(),
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    return this.parseClaudeResponse(textContent.text);
  }

  private buildSystemPrompt(): string {
    return `You are a trading strategy analyst...`; // (full prompt from above)
  }

  private parseClaudeResponse(text: string): ChartAnalysisResponse {
    // Extract sections using regex
    const promptMatch = text.match(/PROMPT:\s*(.+?)(?=\nCONFIDENCE:)/s);
    const confidenceMatch = text.match(/CONFIDENCE:\s*([0-9.]+)/);
    const observationsMatch = text.match(/OBSERVATIONS:\n((?:- .+\n?)+)/);
    const elementsMatch = text.match(/DETECTED_ELEMENTS:\n((?:- .+\n?)+)/);

    const prompt = promptMatch?.[1]?.trim() || '';
    const confidence = parseFloat(confidenceMatch?.[1] || '0.7');

    const observations = observationsMatch?.[1]
      ?.split('\n')
      .map(line => line.replace(/^- /, '').trim())
      .filter(Boolean) || [];

    const detectedElements = elementsMatch?.[1]
      ?.split('\n')
      .map(line => line.replace(/^- /, '').trim())
      .filter(Boolean) || [];

    return {
      prompt,
      confidence,
      observations,
      detectedElements,
    };
  }
}
```

## Security & Validation

### File Upload Security
1. **Size Limit**: Max 10MB to prevent DoS
2. **Type Validation**: Only PNG, JPG, JPEG allowed
3. **MIME Type Check**: Verify both extension and actual MIME type
4. **Memory Storage**: Use multer memory storage (no disk writes)
5. **Immediate Processing**: Analyze and discard, no permanent storage
6. **Sanitization**: Strip EXIF data if present

### API Security
1. **Rate Limiting**: 10 requests/minute per IP address
2. **Authentication**: Consider requiring auth for production
3. **CORS**: Configure appropriate origins
4. **Input Validation**: Check file buffer integrity
5. **Error Handling**: Don't expose internal errors to client

### Image Validation
```typescript
import sharp from 'sharp';

async function validateImage(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();

    // Check dimensions (min 400x300)
    if (!metadata.width || !metadata.height) return false;
    if (metadata.width < 400 || metadata.height < 300) return false;

    // Check format
    if (!['png', 'jpeg', 'jpg'].includes(metadata.format || '')) return false;

    return true;
  } catch {
    return false;
  }
}
```

## Cost Analysis

### Claude Vision API Costs
- **Per Image**: ~$0.015 per chart analysis
- **Monthly Estimate** (100 users, 10 charts each): $15/month
- **Caching Potential**: Hash images to detect duplicates
- **Optimization**: Consider image compression before sending

### Infrastructure Costs
- **Memory**: Multer memory storage (no disk costs)
- **Bandwidth**: Minimal - images uploaded once, discarded after processing
- **Processing**: Sharp library for validation (CPU-efficient)

## Testing Plan

### Unit Tests
- [ ] ChartAnalyzerService.analyzeChart() with mock Claude responses
- [ ] Response parsing with various Claude output formats
- [ ] Error handling for invalid images
- [ ] File validation (size, type, dimensions)

### Integration Tests
- [ ] Upload endpoint with valid images
- [ ] Upload endpoint with invalid images (too large, wrong type)
- [ ] Rate limiting enforcement
- [ ] Full flow: upload → analyze → generate prompt

### Manual Testing Scenarios
1. **Various Chart Types**
   - Candlestick charts
   - Line charts
   - Bar charts
   - Charts with indicators (SMA, VWAP, RSI)
   - Multi-timeframe charts

2. **Quality Variations**
   - High-resolution screenshots
   - Low-resolution images
   - Charts with watermarks
   - Dark mode vs light mode charts

3. **Edge Cases**
   - Very zoomed in (few candles)
   - Very zoomed out (many candles)
   - Unusual timeframes (1-second, weekly)
   - Charts with annotations/drawings

4. **Error Scenarios**
   - Corrupt image files
   - Non-chart images (random photos)
   - Empty/blank images
   - Extremely large files (>10MB)

### Acceptance Criteria
- [ ] User can upload chart via drag & drop
- [ ] User can upload chart via file picker
- [ ] Analysis completes within 5 seconds
- [ ] Generated prompt is relevant and actionable
- [ ] User can edit prompt before execution
- [ ] Confidence score correlates with prompt quality
- [ ] Observations list provides useful context
- [ ] Error messages are clear and actionable

## Example Usage Flow

### Scenario: User uploads bullish breakout chart

1. **User uploads chart**:
   - Screenshot shows SPY breaking above $450 resistance
   - Volume spike visible on breakout bar
   - 5-minute timeframe, 50 candles visible

2. **Claude analyzes**:
   ```
   PROMPT: Test a breakout strategy on SPY. Enter long when price closes above $450 with volume
   at least 1.5x the 20-period average volume. Set stop loss at $448 (recent swing low). Take
   profit at $455 (measured move target). Exit at end of day if neither level is hit.

   CONFIDENCE: 0.85

   OBSERVATIONS:
   - Clear resistance level at $450 tested multiple times
   - Breakout candle shows strong buying pressure with volume spike
   - Prior consolidation pattern suggests continuation potential
   - 5-minute timeframe suitable for intraday strategy
   - Clean price action without excessive noise

   DETECTED_ELEMENTS:
   - Candlestick chart
   - 5-minute timeframe
   - Approximately 50 bars visible
   - Volume histogram visible at bottom
   - Horizontal line drawn at $450 (resistance)
   ```

3. **User reviews and edits**:
   - Original: "for the last 10 days"
   - Modified prompt includes: "for the last 20 trading days"
   - Changes profit target from $455 to $453 (more conservative)

4. **User executes backtest**:
   - Clicks "Run Backtest"
   - System uses Claude-generated script path (due to volume filter)
   - Results show 12 trades, 67% win rate

## Future Enhancements

### Phase 2: Advanced Analysis
- **Pattern Recognition**: Automatically detect head & shoulders, triangles, flags
- **Indicator Detection**: Identify SMA, EMA, VWAP, RSI visible on chart
- **Multi-Timeframe**: Analyze relationship between different timeframes
- **Support/Resistance**: Auto-detect key levels and suggest tests

### Phase 3: Interactive Features
- **Chart Annotation**: Let users draw entry/exit points before analysis
- **Strategy Comparison**: Upload multiple chart variations
- **Historical Pattern Matching**: Find similar setups in database
- **Optimization Suggestions**: Claude suggests parameter ranges to test

### Phase 4: Advanced Workflows
- **Batch Upload**: Analyze multiple charts at once
- **Chart Templates**: Save common chart setups for quick testing
- **Community Sharing**: Share chart-generated strategies with others
- **Performance Tracking**: Track success rate of chart-generated strategies

## Implementation Checklist

### Backend
- [ ] Install multer dependencies
- [ ] Create ChartAnalyzerService
- [ ] Implement Claude Vision API integration
- [ ] Create chart-analysis.ts routes
- [ ] Add multer middleware configuration
- [ ] Update server.ts with new routes
- [ ] Create chart.types.ts
- [ ] Add rate limiting middleware
- [ ] Implement image validation with sharp
- [ ] Write unit tests for ChartAnalyzerService
- [ ] Write integration tests for upload endpoint

### Frontend
- [ ] Create ChartUpload.tsx component
- [ ] Implement drag & drop functionality
- [ ] Add file picker fallback
- [ ] Build image preview component
- [ ] Add loading states and spinners
- [ ] Implement error handling UI
- [ ] Create result display component
- [ ] Update BacktestForm.tsx integration
- [ ] Add analyzeChart() to api.ts
- [ ] Style components with TailwindCSS
- [ ] Add responsive design for mobile
- [ ] Write component tests

### Testing & QA
- [ ] Test with various chart types
- [ ] Test with different image formats
- [ ] Test file size limits
- [ ] Test error scenarios
- [ ] Test on different browsers
- [ ] Test mobile responsiveness
- [ ] Verify prompt quality across samples
- [ ] Load test API endpoint

### Documentation
- [ ] Update README with chart upload feature
- [ ] Add API documentation for /api/charts/analyze
- [ ] Create user guide with screenshots
- [ ] Document Claude Vision API usage
- [ ] Add troubleshooting guide

## Dependencies Summary

### Backend (to install)
```json
{
  "dependencies": {
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "@types/multer": "^1.4.11"
  }
}
```

### Frontend (existing dependencies sufficient)
- React for components
- TailwindCSS for styling
- Existing API client pattern

## File Structure After Implementation

```
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── backtests.ts
│   │   │   ├── chart-analysis.ts (NEW)
│   │   │   └── ...
│   │   └── server.ts (MODIFIED)
│   ├── services/
│   │   ├── backtest-router.service.ts
│   │   ├── chart-analyzer.service.ts (NEW)
│   │   ├── claude.service.ts
│   │   └── ...
│   └── types/
│       ├── chart.types.ts (NEW)
│       └── ...

frontend/
├── src/
│   ├── components/
│   │   ├── BacktestForm.tsx (MODIFIED)
│   │   ├── ChartUpload.tsx (NEW)
│   │   ├── ResultsDisplay.tsx
│   │   └── ...
│   └── services/
│       └── api.ts (MODIFIED)
```

## Notes & Considerations

### Why Memory Storage?
Using `multer.memoryStorage()` instead of disk storage because:
- Images are processed immediately and discarded
- No need for cleanup jobs
- Faster processing (no disk I/O)
- Lower security risk (no files left on disk)

### Why Claude Vision?
- Already using Claude for script generation (consistency)
- Excellent at understanding chart patterns and trading concepts
- Multimodal capabilities specifically designed for image analysis
- Can provide reasoning and confidence scores

### Limitations to Document
- Claude may misinterpret complex charts with many overlays
- Timeframe detection may be unreliable
- Indicator parameters can't be detected (only indicator type)
- Heavily annotated charts may confuse the model
- Non-English chart labels may reduce accuracy

### Best Practices for Users
- Use clean, uncluttered chart screenshots
- Include timeframe in the chart if possible
- Avoid excessive annotations or drawings
- Use standard candlestick or bar charts
- Ensure good contrast and readability
- Review and edit generated prompts before executing

---

**Implementation Priority**: Medium (valuable feature, not blocking)
**Estimated Effort**: 2-3 days for full implementation
**Dependencies**: Claude API key already configured, React/TailwindCSS in place
