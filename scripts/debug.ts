#!/usr/bin/env npx tsx
/**
 * Collaborative debugging script using Playwright
 *
 * Workflow:
 *   1. Run: pnpm debug
 *   2. Interact with the app in Brave
 *   3. Press 'x' to take a snapshot when you hit an issue
 *   4. Claude reads debug-output/ to help diagnose
 *
 * All logs are written continuously to files for live inspection.
 */

import { chromium, Browser, Page, ConsoleMessage, Request, Response } from 'playwright';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DEV_SERVER_URL = 'http://localhost:3000';
const OUTPUT_DIR = 'debug-output';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

// File handles for continuous writing
let consoleLogStream: fs.WriteStream;
let networkLogStream: fs.WriteStream;
let snapshotCounter = 0;

function initOutputFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Clear previous session
  const files = fs.readdirSync(OUTPUT_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(OUTPUT_DIR, file));
  }

  consoleLogStream = fs.createWriteStream(path.join(OUTPUT_DIR, 'console.log'), { flags: 'a' });
  networkLogStream = fs.createWriteStream(path.join(OUTPUT_DIR, 'network.jsonl'), { flags: 'a' });

  // Write session start marker
  const startMarker = `\n${'='.repeat(60)}\nSession started: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
  consoleLogStream.write(startMarker);
}

function logConsole(type: string, text: string, location?: string) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${type.toUpperCase()}] ${text}${location ? ` (${location})` : ''}\n`;
  consoleLogStream.write(entry);
}

function logNetwork(entry: object) {
  networkLogStream.write(JSON.stringify(entry) + '\n');
}

async function waitForServer(url: string, timeout = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function startDevServer(): Promise<ChildProcess | null> {
  try {
    const response = await fetch(DEV_SERVER_URL);
    if (response.ok) {
      console.log(`${colors.green}Dev server already running at ${DEV_SERVER_URL}${colors.reset}`);
      return null;
    }
  } catch {
    // Server not running
  }

  console.log(`${colors.cyan}Starting dev server...${colors.reset}`);
  const devServer = spawn('pnpm', ['dev'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  devServer.stdout?.on('data', (data) => {
    const str = data.toString();
    if (str.includes('Local:') || str.includes('ready')) {
      console.log(`${colors.gray}[vite] ${str.trim()}${colors.reset}`);
    }
  });

  devServer.stderr?.on('data', (data) => {
    console.log(`${colors.red}[vite] ${data.toString().trim()}${colors.reset}`);
  });

  const ready = await waitForServer(DEV_SERVER_URL);
  if (!ready) {
    console.error(`${colors.red}Failed to start dev server${colors.reset}`);
    devServer.kill();
    process.exit(1);
  }

  console.log(`${colors.green}Dev server ready${colors.reset}`);
  return devServer;
}

function formatConsoleMessage(msg: ConsoleMessage): { formatted: string; loc: string } {
  const type = msg.type();
  const typeColors: Record<string, string> = {
    log: colors.reset,
    info: colors.blue,
    warn: colors.yellow,
    error: colors.red,
    debug: colors.gray,
  };
  const color = typeColors[type] || colors.reset;
  const location = msg.location();
  const loc = location.url ? `${path.basename(location.url)}:${location.lineNumber}` : '';
  return { formatted: `${color}[${type}]${colors.reset} ${msg.text()} ${colors.gray}${loc}${colors.reset}`, loc };
}

// This script runs in the browser - kept as a string to avoid tsx transformations
const REACT_STATE_SCRIPT = `
(function() {
  const rootElement = document.getElementById('root');
  if (!rootElement) return { error: 'No #root element found' };

  const reactKey = Object.keys(rootElement).find(key => key.startsWith('__reactFiber'));
  if (!reactKey) return { error: 'React fiber not found - app may not be mounted' };

  const fiber = rootElement[reactKey];

  const serializeValue = (val, depth = 0) => {
    if (depth > 3) return '[max depth]';
    if (val === null) return null;
    if (val === undefined) return undefined;
    if (typeof val === 'function') return '[function]';
    if (typeof val === 'symbol') return val.toString();
    if (val instanceof Element) return '[Element: ' + val.tagName + ']';
    if (Array.isArray(val)) {
      if (val.length > 10) return '[Array(' + val.length + ')]';
      return val.map(v => serializeValue(v, depth + 1));
    }
    if (typeof val === 'object') {
      if (val.$$typeof) return '[ReactElement]';
      const result = {};
      const keys = Object.keys(val).slice(0, 20);
      for (const k of keys) {
        if (k.startsWith('_') || k.startsWith('$$')) continue;
        result[k] = serializeValue(val[k], depth + 1);
      }
      if (Object.keys(val).length > 20) result['...'] = (Object.keys(val).length - 20) + ' more keys';
      return result;
    }
    return val;
  };

  const extractHooks = (memoizedState) => {
    const hooks = [];
    let state = memoizedState;
    let hookIndex = 0;

    while (state && hookIndex < 20) {
      if (state.memoizedState !== undefined) {
        const hookData = { index: hookIndex };

        if (state.queue !== null && typeof state.memoizedState !== 'function') {
          hookData.type = 'useState';
          hookData.value = serializeValue(state.memoizedState);
        } else if (typeof state.memoizedState === 'function') {
          hookData.type = 'useCallback/useMemo';
        } else if (state.memoizedState && typeof state.memoizedState === 'object' && 'current' in state.memoizedState) {
          hookData.type = 'useRef';
          hookData.current = serializeValue(state.memoizedState.current);
        }

        if (hookData.type) {
          hooks.push(hookData);
        }
      }
      state = state.next;
      hookIndex++;
    }

    return hooks;
  };

  const extractComponentTree = (fiber, depth = 0) => {
    if (!fiber || depth > 15) return [];

    const components = [];
    let current = fiber;

    while (current) {
      const isComponent = typeof current.type === 'function' ||
        (typeof current.type === 'object' && current.type !== null);

      if (isComponent) {
        const name = current.type?.displayName || current.type?.name || 'Anonymous';

        if (!name.startsWith('_') && name !== 'Anonymous') {
          const component = { name, depth };

          if (current.memoizedProps) {
            const props = {};
            for (const [key, value] of Object.entries(current.memoizedProps)) {
              if (key === 'children' || key.startsWith('$$')) continue;
              props[key] = serializeValue(value);
            }
            if (Object.keys(props).length > 0) {
              component.props = props;
            }
          }

          if (current.memoizedState) {
            const hooks = extractHooks(current.memoizedState);
            if (hooks.length > 0) {
              component.hooks = hooks;
            }
          }

          components.push(component);
        }
      }

      if (current.child) {
        components.push(...extractComponentTree(current.child, depth + 1));
      }

      current = current.sibling;
    }

    return components;
  };

  const tree = extractComponentTree(fiber);

  return {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    componentCount: tree.length,
    components: tree,
  };
})()
`;

async function captureReactState(page: Page): Promise<object | null> {
  try {
    return await page.evaluate(REACT_STATE_SCRIPT);
  } catch (e: any) {
    return { error: e.message };
  }
}

async function captureSnapshot(page: Page, reason: string = 'manual') {
  snapshotCounter++;
  const timestamp = Date.now();
  const prefix = `snapshot-${snapshotCounter}-${timestamp}`;

  console.log(`\n${colors.bold}${colors.cyan}Taking snapshot #${snapshotCounter}...${colors.reset}`);

  // Screenshot
  const screenshotPath = path.join(OUTPUT_DIR, `${prefix}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`  ${colors.green}Screenshot: ${screenshotPath}${colors.reset}`);

  // React state
  const reactState = await captureReactState(page);
  const statePath = path.join(OUTPUT_DIR, `${prefix}-state.json`);
  fs.writeFileSync(statePath, JSON.stringify(reactState, null, 2));
  console.log(`  ${colors.green}React state: ${statePath}${colors.reset}`);

  // Current DOM snapshot of key areas
  const domSnapshot = await page.evaluate(`
    (function() {
      const getElementInfo = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        return {
          selector,
          text: el.textContent?.slice(0, 500),
          html: el.innerHTML.slice(0, 1000),
        };
      };

      return {
        title: document.title,
        body: document.body.innerHTML.length,
        main: getElementInfo('main'),
        errors: Array.from(document.querySelectorAll('[class*="error"], [class*="Error"]')).map(el => ({
          class: el.className,
          text: el.textContent?.slice(0, 200),
        })),
      };
    })()
  `);
  const domPath = path.join(OUTPUT_DIR, `${prefix}-dom.json`);
  fs.writeFileSync(domPath, JSON.stringify(domSnapshot, null, 2));
  console.log(`  ${colors.green}DOM snapshot: ${domPath}${colors.reset}`);

  // Mark in console log
  consoleLogStream.write(`\n${'='.repeat(60)}\nSNAPSHOT #${snapshotCounter} - ${reason}\nTimestamp: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`);

  console.log(`${colors.green}Snapshot #${snapshotCounter} complete!${colors.reset}\n`);

  return prefix;
}

async function main() {
  const args = process.argv.slice(2);
  const headless = args.includes('--headless');
  const url = args.find(a => a.startsWith('http')) || DEV_SERVER_URL;

  console.log(`
${colors.magenta}${colors.bold}╔════════════════════════════════════════════════════╗
║         F1 Betting Tracker - Debug Mode            ║
╚════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}Collaborative debugging workflow:${colors.reset}
  1. Interact with the app in Brave
  2. When you hit an issue, press ${colors.yellow}'x'${colors.reset} to snapshot
  3. Tell Claude about the issue
  4. Claude reads debug-output/ to diagnose
`);

  initOutputFiles();
  const devServer = await startDevServer();

  console.log(`\n${colors.cyan}Launching browser...${colors.reset}\n`);

  const browser: Browser = await chromium.launch({
    headless,
    devtools: !headless,
    executablePath: process.env.BROWSER_PATH || '/etc/profiles/per-user/m0ar/bin/brave',
    args: ['--auto-open-devtools-for-tabs', '--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null, // Use full window size
  });

  const page: Page = await context.newPage();

  // Capture console messages - both display and write to file
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();
    const loc = location.url ? `${path.basename(location.url)}:${location.lineNumber}` : '';

    // Write to file
    logConsole(type, text, loc);

    // Display (skip noisy vite messages)
    if (!text.includes('[vite]') || type === 'error' || type === 'warn') {
      const typeColors: Record<string, string> = {
        log: colors.reset,
        info: colors.blue,
        warn: colors.yellow,
        error: colors.red,
        debug: colors.gray,
      };
      const color = typeColors[type] || colors.reset;
      console.log(`${color}[${type}]${colors.reset} ${text} ${colors.gray}${loc}${colors.reset}`);
    }
  });

  // Capture page errors
  page.on('pageerror', (error) => {
    console.log(`${colors.red}${colors.bold}[PAGE ERROR]${colors.reset} ${error.message}`);
    logConsole('PAGE_ERROR', `${error.message}\n${error.stack}`);
  });

  // Capture network
  page.on('request', (request) => {
    const url = request.url();
    // Skip vite internals
    if (url.includes('/@vite') || url.includes('node_modules') || url.includes('.hot-update.')) {
      return;
    }

    const entry = {
      type: 'request',
      timestamp: new Date().toISOString(),
      method: request.method(),
      url: url,
      resourceType: request.resourceType(),
    };
    logNetwork(entry);

    // Only log API calls to terminal
    if (url.includes('/_serverFn') || url.includes('/api/')) {
      const urlObj = new URL(url);
      console.log(`${colors.cyan}[${request.method()}]${colors.reset} ${urlObj.pathname.slice(0, 60)}...`);
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/@vite') || url.includes('node_modules') || url.includes('.hot-update.')) {
      return;
    }

    let body: any = null;
    try {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('json') && response.status() < 300) {
        const text = await response.text();
        body = text.length < 50000 ? JSON.parse(text) : `[Response too large: ${text.length} bytes]`;
      }
    } catch { }

    const entry = {
      type: 'response',
      timestamp: new Date().toISOString(),
      status: response.status(),
      url: url,
      body,
    };
    logNetwork(entry);

    // Log API responses
    if (url.includes('/_serverFn') || url.includes('/api/')) {
      const statusColor = response.status() >= 400 ? colors.red : colors.green;
      console.log(`${statusColor}[${response.status()}]${colors.reset} Response received`);
    }
  });

  // Navigate
  console.log(`${colors.cyan}Navigating to ${url}...${colors.reset}\n`);
  await page.goto(url, { waitUntil: 'networkidle' });

  // Initial snapshot
  await captureSnapshot(page, 'initial load');

  console.log(`
${colors.magenta}════════════════════════════════════════════════════${colors.reset}
${colors.bold}Ready for debugging!${colors.reset}

${colors.cyan}Commands:${colors.reset}
  ${colors.yellow}x${colors.reset} - Take snapshot (screenshot + React state + DOM)
  ${colors.yellow}c${colors.reset} - Clear console log file
  ${colors.yellow}q${colors.reset} - Quit

${colors.gray}Logs are continuously written to:${colors.reset}
  ${colors.gray}• debug-output/console.log${colors.reset}
  ${colors.gray}• debug-output/network.jsonl${colors.reset}
${colors.magenta}════════════════════════════════════════════════════${colors.reset}
`);

  // Interactive mode
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (key: string) => {
    switch (key.toLowerCase()) {
      case 'x':
        await captureSnapshot(page, 'user triggered');
        break;

      case 'c':
        consoleLogStream.write(`\n${'='.repeat(60)}\nCONSOLE CLEARED\n${'='.repeat(60)}\n\n`);
        console.log(`${colors.green}Console log marker added${colors.reset}`);
        break;

      case 'q':
      case '\u0003': // Ctrl+C
        console.log(`\n${colors.cyan}Taking final snapshot...${colors.reset}`);
        await captureSnapshot(page, 'session end');

        consoleLogStream.end();
        networkLogStream.end();

        console.log(`${colors.green}Session saved to ${OUTPUT_DIR}/${colors.reset}`);

        await browser.close();
        devServer?.kill();
        process.exit(0);
        break;
    }
  });

  browser.on('disconnected', () => {
    console.log(`\n${colors.yellow}Browser closed${colors.reset}`);
    consoleLogStream.end();
    networkLogStream.end();
    devServer?.kill();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(`${colors.red}Error: ${e.message}${colors.reset}`);
  process.exit(1);
});
