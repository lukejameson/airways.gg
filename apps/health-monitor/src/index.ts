import { loadEnv } from '@airways/common';
loadEnv({ serviceName: 'HealthMonitor', startDir: __dirname, logPath: true });

import { runAllChecks, type CheckResult } from './checks';
import { analyzeWithLLM, type LLMResponse, groupByCategory } from './llm';
import { sendAlert } from '@airways/telegram';

const TIER1_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const TIER2_INTERVAL_HOURS = 2;
const HEARTBEAT_INTERVAL_HOURS = 6;
const HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_HOURS * 60 * 60 * 1000;

// Service name prefixes that may appear in check names like "guernsey_last_run"
const SERVICE_PREFIXES = ['guernsey_', 'fr24_', 'position_', 'weather_', 'adsb_', 'notification_'];

function stripServicePrefix(name: string): string {
  for (const prefix of SERVICE_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  return name;
}

function buildTelegramMessage(
  checks: CheckResult[],
  llmResult: LLMResponse | null,
  cycleTime: string,
  isHeartbeat: boolean,
): string {
  const failed = checks.filter((c) => !c.passed);
  const allPassed = failed.length === 0;
  const hasLLM = llmResult && llmResult.correlated_issues.length > 0;

  // Silent when healthy and no LLM findings
  if (allPassed && !hasLLM && !isHeartbeat) return '';

  const lines: string[] = [];

  if (isHeartbeat) {
    lines.push('💚 *airways.gg — Health Monitor Heartbeat*');
    lines.push(`_All systems healthy as of ${cycleTime}_`);
    lines.push('');
    lines.push(`✅ ${checks.length} checks — all passing`);
    return lines.join('\n');
  }

  // Status emoji
  const statusEmoji = allPassed ? '✅' : '🔴';
  lines.push(`${statusEmoji} *airways.gg — Health Report*`);
  lines.push(`_${cycleTime}_`);
  lines.push('');

  // LLM findings at top
  if (hasLLM) {
    lines.push('🧠 *LLM Cross-Signal Analysis*');
    for (const issue of llmResult!.correlated_issues) {
      const sev = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '⚠️' : 'ℹ️';
      const conf = issue.confidence === 'low' ? ' _(low confidence)_' : '';
      lines.push(`${sev} *${issue.title}*${conf}`);
      lines.push(`  ${issue.explanation}`);
    }
    lines.push('');
  }

  // Summary
  if (llmResult?.summary) {
    lines.push(`📋 ${llmResult.summary}`);
    lines.push('');
  }

  // Grouped check results (only show failing when not all passed)
  if (!allPassed) {
    const categories = groupByCategory(checks);
    for (const [category, catChecks] of Object.entries(categories)) {
      const catFailed = catChecks.filter((c) => !c.passed);
      if (catFailed.length === 0) continue;

      const displayName = categoryDisplayName(category);
      lines.push(`*${displayName}*`);
      for (const c of catFailed) {
        lines.push(`  🔴 ${stripServicePrefix(c.name)}: ${c.value} (threshold: ${c.threshold})`);
      }
      lines.push('');
    }

    lines.push(`_${failed.length}/${checks.length} checks failing_`);
  } else {
    lines.push(`_All ${checks.length} checks passing_`);
  }

  // Token info if available
  if (llmResult?.tokens_used) {
    lines.push('');
    lines.push(`_Tokens: ${llmResult.tokens_used.input} in / ${llmResult.tokens_used.output} out_`);
  }

  return lines.join('\n');
}

function categoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    scraper_health: 'Scrapers',
    flight_integrity: 'Flight Data',
    notification: 'Notifications',
    weather_position: 'Weather & Positions',
    other: 'Other',
  };
  return names[category] ?? category;
}

async function runCycle(
  cycleTime: string,
  shouldRunLLM: boolean,
  isHeartbeat: boolean,
): Promise<void> {
  const label = isHeartbeat ? 'Heartbeat' : 'Tier 1';
  console.log(`[HealthMonitor] ${label} starting — ${cycleTime}`);
  const t0 = performance.now();

  let checks: CheckResult[];
  try {
    checks = await runAllChecks();
  } catch (err) {
    console.error(`[HealthMonitor] ${label} check execution failed:`, err);
    await sendAlert('health-monitor', 'critical', `${label} check execution failed`, err).catch(
      () => {},
    );
    return;
  }

  const queryMs = Math.round(performance.now() - t0);
  const failed = checks.filter((c) => !c.passed).length;
  console.log(
    `[HealthMonitor] ${label} complete — ${checks.length} checks (${failed} failing) in ${queryMs}ms`,
  );

  // LLM analysis
  let llmResult: LLMResponse | null = null;
  if (shouldRunLLM && !isHeartbeat) {
    console.log(`[HealthMonitor] Tier 2 (LLM) starting — ${cycleTime}`);
    llmResult = await analyzeWithLLM(checks, cycleTime);
    if (llmResult) {
      console.log(
        `[HealthMonitor] LLM: ${llmResult.overall_health}, ${llmResult.correlated_issues.length} issues, tokens: ${llmResult.tokens_used?.input ?? '?'}/${llmResult.tokens_used?.output ?? '?'}`,
      );
    } else {
      console.log('[HealthMonitor] LLM analysis skipped or failed');
    }
  }

  // Build and send Telegram message
  const message = buildTelegramMessage(checks, llmResult, cycleTime, isHeartbeat);
  if (message) {
    const level = checks.every((c) => c.passed) ? 'warning' : 'critical';
    await sendAlert('health-monitor', level, message).catch(() => {});
    console.log(`[HealthMonitor] Telegram ${isHeartbeat ? 'heartbeat' : 'alert'} sent`);
  } else {
    console.log('[HealthMonitor] All healthy — silent cycle');
  }
}

/** Tracks when the last heartbeat was sent to avoid duplicates */
let lastHeartbeatCycle = 0;

async function main() {
  console.log('[HealthMonitor] Health Monitor starting...');
  console.log(`[HealthMonitor] Tier 1 interval: ${TIER1_INTERVAL_MS / 60000} minutes`);
  console.log(`[HealthMonitor] Tier 2 (LLM) interval: every ${TIER2_INTERVAL_HOURS} hours`);
  console.log(`[HealthMonitor] Heartbeat: every ${HEARTBEAT_INTERVAL_HOURS} hours`);

  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn('[HealthMonitor] DEEPSEEK_API_KEY not set — LLM tier will be skipped');
  }

  // Run first cycle immediately
  const now = new Date();
  const hour = now.getUTCHours();
  const isLLMCycle = hour % TIER2_INTERVAL_HOURS === 0;
  await runCycle(now.toISOString(), isLLMCycle, false);

  // Schedule Tier 1 hourly
  setInterval(async () => {
    const cycleTime = new Date().toISOString();
    const currentHour = new Date().getUTCHours();
    const shouldRunLLM = currentHour % TIER2_INTERVAL_HOURS === 0;
    const cycleIndex = Math.floor(Date.now() / TIER1_INTERVAL_MS);

    await runCycle(cycleTime, shouldRunLLM, false);

    // Heartbeat: send an "all clear" periodically to prove the monitor is alive.
    // Only fire if enough time has passed since the last heartbeat.
    if (cycleIndex - lastHeartbeatCycle >= HEARTBEAT_INTERVAL_HOURS) {
      const allPassed = (await runAllChecks().catch(() => [] as CheckResult[])).every(
        (c) => c.passed,
      );
      if (allPassed) {
        const heartbeatMsg = buildTelegramMessage(
          [],
          null,
          cycleTime,
          true,
        );
        if (heartbeatMsg) {
          await sendAlert('health-monitor', 'warning', heartbeatMsg).catch(() => {});
          lastHeartbeatCycle = cycleIndex;
          console.log('[HealthMonitor] Heartbeat sent');
        }
      }
    }
  }, TIER1_INTERVAL_MS);
}

process.on('uncaughtException', (err) => {
  console.error('[HealthMonitor] Uncaught exception:', err);
  sendAlert('health-monitor', 'critical', 'Uncaught exception', err).finally(() => process.exit(1));
});

main().catch((err) => {
  console.error('[HealthMonitor] Fatal error:', err);
  sendAlert('health-monitor', 'critical', 'Fatal startup error', err).finally(() =>
    process.exit(1),
  );
});
