import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

function findBrowserBinary() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const commandNames = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe']
    : process.platform === 'darwin'
      ? ['Google Chrome', 'Microsoft Edge']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];
  const paths = process.env.PATH?.split(delimiter).filter(Boolean) ?? [];
  const fromPath = commandNames.find((command) => paths.some((path) => existsSync(join(path, command))));
  if (fromPath) return fromPath;
  const platformBinaries = process.platform === 'win32'
    ? [
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
      process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
      process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
      process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
      process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : [];
  const binary = platformBinaries.find((path) => path && existsSync(path));
  if (binary) return binary;
  throw new Error('No Chrome-compatible browser found. Install Chrome, Chromium, or Microsoft Edge, or set CHROME_BIN to its executable path.');
}

export async function openDomBrowser(t) {
  const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html><head><title>DOM regression</title></head><body></body></html>');
        return;
      }
      const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!path.startsWith(root + sep)) throw new Error('Invalid test path');
      let source = await readFile(path);
      if (url.searchParams.has('dom-test') && url.pathname === '/src/modules/grades/app.js') {
        source = source.toString().split('\ninstallAppTooltips(document);')[0]
          + '\nexport { GradesApp, createGradeAssessmentDisplayTitle, createGradeAssessmentWeight, createGradeAssessmentOccurrenceEmoji, createGradeTestAfbOptions, createGradeTestScaleTooltip, createGradeStudentNameElement };';
      }
      if (url.searchParams.has('dom-test') && url.pathname === '/src/modules/planning/app.js') {
        source = source.toString().split('\ninstallAppTooltips(document);')[0]
          + '\nexport { PlanningApp };';
      }
      response.setHeader('Content-Type', path.endsWith('.js') || path.endsWith('.mjs')
        ? 'text/javascript; charset=utf-8' : 'application/octet-stream');
      response.end(source);
    } catch (error) {
      response.writeHead(404);
      response.end(String(error));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const profile = await mkdtemp(join(tmpdir(), 'teachhelper-dom-'));
  let browser;
  let socket;
  t.after(async () => {
    socket?.close();
    if (browser && browser.exitCode === null) {
      const exited = once(browser, 'exit');
      browser.kill();
      await exited;
    }
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  browser = spawn(findBrowserBinary(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((done, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome startup timed out: ${stderr}`)), 15000);
    browser.once('error', (error) => { clearTimeout(timer); reject(error); });
    browser.once('exit', () => { clearTimeout(timer); reject(new Error(`Chrome exited: ${stderr}`)); });
    browser.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const result = JSON.parse(data);
    const callback = pending.get(result.id);
    if (callback) { pending.delete(result.id); callback(result); }
  });
  function command(method, params = {}, sessionId) {
    return new Promise((done, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
      pending.set(id, (result) => {
        clearTimeout(timer);
        if (result.error) reject(new Error(JSON.stringify(result.error)));
        else done(result.result);
      });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Page.enable', {}, sessionId);
  const origin = `http://127.0.0.1:${server.address().port}`;
  await command('Page.navigate', { url: origin }, sessionId);
  return async function evaluate(fn, argument) {
    const result = await command('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(argument)})`,
      awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
}
