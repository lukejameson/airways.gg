import type { CheckResult } from './checks';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT = `You are a flight tracking system health monitor for airways.gg, a platform that tracks flights at Guernsey Airport (GCI) and surrounding airports.

Your job is to analyze health check results from multiple subsystems (scrapers, flight data, notifications, weather/position data) and identify CORRELATED issues that individual checks would miss.

Look for:
- Multiple services failing simultaneously (possible shared infrastructure outage)
- Cascading failures (one service's downtime causing downstream data gaps)
- Patterns across categories (e.g., scraper gap + weather gap + position gap all starting at the same time)
- Time-based clustering of failures

Return ONLY a valid JSON object with this structure:
{
  "overall_health": "healthy" | "degraded" | "unhealthy",
  "correlated_issues": [
    {
      "severity": "high" | "medium" | "low",
      "title": "brief title",
      "explanation": "clear explanation of the correlation found",
      "confidence": "high" | "medium" | "low",
      "affected_checks": ["check_name_1", "check_name_2"]
    }
  ],
  "false_alarm_suggestions": [
    {
      "check_name": "name of check",
      "reason": "why this might be a false alarm"
    }
  ],
  "summary": "2-3 sentence executive summary"
}

Be conservative. Only flag correlations you are reasonably confident about. Flag uncertain findings as low confidence. Never fabricate issues — if everything looks fine, return healthy with an empty correlated_issues array.`;

export interface LLMCorrelatedIssue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  affected_checks: string[];
}

export interface LLMFalseAlarmSuggestion {
  check_name: string;
  reason: string;
}

export interface LLMResponse {
  overall_health: 'healthy' | 'degraded' | 'unhealthy';
  correlated_issues: LLMCorrelatedIssue[];
  false_alarm_suggestions: LLMFalseAlarmSuggestion[];
  summary: string;
  tokens_used?: { input: number; output: number };
}

/**
 * Build the user prompt from check results.
 * Returns { prompt: string, estimatedInputTokens: number }
 */
export function buildPrompt(
  checks: CheckResult[],
  cycleTime: string,
): { prompt: string; estimatedInputTokens: number } {
  let prompt = `HEALTH CHECK — ${cycleTime}\n\n`;

  // Group by category prefix
  const categories = groupByCategory(checks);

  for (const [category, catChecks] of Object.entries(categories)) {
    const catFailed = catChecks.filter(c => !c.passed);
    const catPassed = catChecks.filter(c => c.passed);

    prompt += `=== ${category.toUpperCase()} (${catChecks.length} checks, ${catFailed.length} failing) ===\n`;

    // Show failing checks first with samples
    for (const c of catFailed) {
      prompt += `[FAIL] ${c.name}: ${c.value} (threshold: ${c.threshold})\n`;
      if (c.samples && c.samples.length > 0) {
        prompt += `  Samples: ${JSON.stringify(c.samples.slice(0, 10))}\n`;
      }
    }

    // Show passing checks (compact)
    for (const c of catPassed) {
      prompt += `[PASS] ${c.name}: ${c.value} (threshold: ${c.threshold})\n`;
    }

    prompt += '\n';
  }

  // Rough token estimate: ~4 chars per token
  const estimatedInputTokens = Math.ceil(prompt.length / 4) + Math.ceil(SYSTEM_PROMPT.length / 4);

  return { prompt, estimatedInputTokens };
}

export function groupByCategory(checks: CheckResult[]): Record<string, CheckResult[]> {
  const categories: Record<string, CheckResult[]> = {};

  for (const c of checks) {
    let category: string;
    if (c.name.includes('_last_run') || c.name.includes('_failure_rate') || c.name.includes('_consecutive') || c.name.includes('_zero_records')) {
      category = 'scraper_health';
    } else if (c.name.includes('null_status') || c.name.includes('negative_delay') || c.name.includes('stale_updated') || c.name.includes('orphaned') || c.name.includes('count_vs_avg')) {
      category = 'flight_integrity';
    } else if (c.name.includes('watermark') || c.name.includes('dead_push')) {
      category = 'notification';
    } else if (c.name.includes('weather_gap') || c.name.includes('position_gap') || c.name.includes('stale_weather')) {
      category = 'weather_position';
    } else {
      category = 'other';
    }

    if (!categories[category]) categories[category] = [];
    categories[category].push(c);
  }

  return categories;
}

/**
 * Send check results to DeepSeek V4 Flash for cross-signal analysis.
 * Returns null if the API call fails (caller should fall back to static-only report).
 */
export async function analyzeWithLLM(
  checks: CheckResult[],
  cycleTime: string,
): Promise<LLMResponse | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[HealthMonitor] DEEPSEEK_API_KEY not set — skipping LLM tier');
    return null;
  }

  const { prompt: userPrompt, estimatedInputTokens } = buildPrompt(checks, cycleTime);

  const controller = new AbortController();
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS ?? '30000', 10);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      console.error(`[HealthMonitor] DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as {
      choices: [{ message: { content: string } }];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[HealthMonitor] DeepSeek returned empty response');
      return null;
    }

    // Extract JSON from response (may be wrapped in markdown code block)
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as LLMResponse;

    // Attach token usage
    parsed.tokens_used = {
      input: data.usage?.prompt_tokens ?? estimatedInputTokens,
      output: data.usage?.completion_tokens ?? 0,
    };

    return parsed;
  } catch (err) {
    const message = (err as Error).name === 'AbortError'
      ? `LLM request timed out after ${timeoutMs}ms`
      : (err as Error).message;
    console.error('[HealthMonitor] LLM analysis failed:', message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
