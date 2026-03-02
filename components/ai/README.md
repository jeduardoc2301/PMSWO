# AI Assistant Components

This directory contains all AI-powered features for the project management platform.

## Components

### AIReportDialog
- **Purpose**: Generate AI-powered project reports with different detail levels
- **Requirements**: 8.1, 8.2, 8.3
- **Features**:
  - Three detail levels: Executive, Detailed, Complete
  - Loading state during generation
  - Copy to clipboard functionality
  - Modal display with formatted report

### AIAnalysisDialog
- **Purpose**: Analyze projects and provide AI-powered suggestions
- **Requirements**: 9.1, 9.2
- **Features**:
  - Automatic analysis on open
  - Displays suggestions with priority levels
  - Shows detected risks
  - Lists overdue items with recommendations
  - Action buttons for each suggestion (create blocker, adjust dates, etc.)

### AITextImprover
- **Purpose**: Improve text with AI suggestions (card-based display)
- **Requirements**: 8.4
- **Features**:
  - Shows original and improved text side-by-side
  - Accept/reject functionality
  - Supports different text purposes (description, notes, general)

### AITextImproveButton
- **Purpose**: Inline button for text improvement (dialog-based)
- **Requirements**: 8.4
- **Features**:
  - Compact button for inline use
  - Dialog display for comparison
  - Accept/reject functionality

### AILoadingState
- **Purpose**: Consistent loading UI for AI operations
- **Requirements**: 9.3, 14.3
- **Features**:
  - Animated spinner
  - Context-aware messages
  - Different types: report, analysis, text

### AIErrorState
- **Purpose**: User-friendly error messages for AI failures
- **Requirements**: 9.3, 14.3
- **Features**:
  - Different error types: general, guardrails, rate limit, unavailable
  - Contextual help text
  - Retry functionality (where applicable)
  - Graceful handling of guardrails violations

## Translation Files

- `messages/es/ai.json` - Spanish translations
- `messages/pt/ai.json` - Portuguese translations

## Integration

The AI components are integrated into the project detail page:
- `app/[locale]/projects/[id]/project-detail-client.tsx`

## API Endpoints Used

- `POST /api/v1/ai/generate-report` - Generate project report
- `POST /api/v1/ai/analyze-project` - Analyze project with AI
- `POST /api/v1/ai/improve-text` - Improve text with AI

## Notes

1. **Toast Notifications**: Currently using simple alerts. For production, implement a proper toast notification system.

2. **Popover Component**: The `@radix-ui/react-popover` package needs to be installed if you want to use the popover-based text improver. Current implementation uses Dialog instead.

3. **Error Handling**: All components handle errors gracefully and display user-friendly messages based on error type (guardrails violations, rate limits, service unavailable).

4. **Loading States**: All AI operations show appropriate loading indicators to provide feedback to users.

5. **Accessibility**: Components use semantic HTML and ARIA attributes from shadcn/ui components.

## Future Enhancements

- Add proper toast notification system
- Implement action handlers for AI suggestions (create blocker, adjust dates, etc.)
- Add caching indicators to show when using cached analysis
- Add keyboard shortcuts for common actions
- Implement undo functionality for accepted text improvements
