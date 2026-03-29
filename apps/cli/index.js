#!/usr/bin/env node

/**
 * Ultimate System CLI - Beautiful, Intuitive Terminal Interface
 * 
 * A modern TUI for interacting with the Ultimate System orchestration platform.
 * Features:
 * - Interactive task creation and management
 * - Real-time system monitoring
 * - Approval workflows
 * - Beautiful visual design
 */

import { program } from 'commander';
import chalk from 'chalk';
import {
  intro,
  outro,
  text,
  select,
  multiselect,
  confirm,
  spinner,
  note,
  isCancel
} from '@clack/prompts';
import process from 'process';

// Configuration
const API_BASE = process.env.ULTIMATE_SYSTEM_API_BASE || process.env.API_BASE_URL || 'http://localhost:4100';
const POLL_INTERVAL = 3000; // 3 seconds for monitoring mode

// Color helpers using @clack/prompts colors
const c = {
  bold: (s) => chalk.bold(s),
  cyan: (s) => chalk.cyan(s),
  magenta: (s) => chalk.magenta(s),
  green: (s) => chalk.green(s),
  yellow: (s) => chalk.yellow(s),
  red: (s) => chalk.red(s),
  gray: (s) => chalk.gray(s),
  white: (s) => chalk.white(s),
  dim: (s) => chalk.dim(s),
  bgCyan: (s) => chalk.bgCyan.black(s),
  bgGreen: (s) => chalk.bgGreen.black(s),
  bgRed: (s) => chalk.bgRed.black(s),
  bgYellow: (s) => chalk.bgYellow.black(s),
};

// API Client
class UltimateClient {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
    this.sessionCookie = null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.sessionCookie && { 'Cookie': this.sessionCookie }),
      ...options.headers
    };

    try {
      const res = await fetch(url, { ...options, headers });
      
      // Capture session cookie
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        this.sessionCookie = setCookie.split(';')[0];
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      return res.json();
    } catch (err) {
      if (err.message.includes('fetch')) {
        throw new Error(`Cannot connect to ${this.baseUrl}. Is the server running?`);
      }
      throw err;
    }
  }

  async getSession() {
    return this.request('/api/auth/session');
  }

  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return data;
  }

  async getState() {
    return this.request('/api/state');
  }

  async getTask(taskId) {
    return this.request(`/api/tasks/${taskId}/detail`);
  }

  async getWorker(workerId) {
    return this.request(`/api/workers/${workerId}/detail`);
  }

  async createTask(taskData) {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  }

  async approveTask(taskId, approved, reason = '') {
    return this.request(`/api/tasks/${taskId}/approval`, {
      method: 'POST',
      body: JSON.stringify({
        approvalState: approved ? 'approved' : 'rejected',
        reason
      })
    });
  }

  async getTasks() {
    return this.request('/api/tasks');
  }

  async getWorkers() {
    return this.request('/api/workers');
  }
}

// Utility functions
function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatTime(isoString) {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  return date.toLocaleString();
}

function formatRelativeTime(isoString) {
  if (!isoString) return 'No recent signal';
  const seconds = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function statusColor(status) {
  const colors = {
    released: 'green',
    passed: 'green',
    approved: 'green',
    idle: 'green',
    succeeded: 'green',
    running: 'cyan',
    busy: 'cyan',
    dispatched: 'cyan',
    completed: 'yellow',
    pending: 'yellow',
    queued: 'yellow',
    blocked: 'red',
    failed: 'red',
    rejected: 'red'
  };
  return c[colors[status] || 'white'];
}

function statusIcon(status) {
  const icons = {
    released: '✓',
    passed: '✓',
    approved: '✓',
    idle: '○',
    succeeded: '✓',
    running: '◐',
    busy: '◐',
    dispatched: '◑',
    completed: '◔',
    pending: '○',
    queued: '○',
    blocked: '✗',
    failed: '✗',
    rejected: '✗'
  };
  return icons[status] || '?';
}

function renderProgressBar(value, max, width = 20) {
  const percentage = Math.min(value / max, 1);
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  return c.cyan('█'.repeat(filled)) + c.gray('░'.repeat(empty));
}

function renderTaskCard(task, index) {
  const status = task.status;
  const icon = statusIcon(status);
  const color = statusColor(status);
  
  const title = task.title.length > 40 ? task.title.substring(0, 37) + '...' : task.title;
  const budget = formatMoney(task.budgetActualUsd || task.budgetCapUsd || 0);
  
  return [
    `${c.dim(`${String(index + 1).padStart(2, ' ')}`)} ${color(icon)} ${c.bold(title)}`,
    `      ${c.gray('Status:')} ${color(status.padEnd(12))} ${c.gray('Budget:')} ${c.white(budget)}`,
    `      ${c.gray('Mode:')} ${c.white(task.executionMode.padEnd(14))} ${c.gray('Approval:')} ${statusColor(task.approvalState)(task.approvalState)}`
  ].join('\n');
}

function renderWorkerCard(worker, index) {
  const status = worker.status;
  const icon = statusIcon(status);
  const color = statusColor(status);
  
  const name = worker.name.length > 40 ? worker.name.substring(0, 37) + '...' : worker.name;
  const budget = formatMoney(worker.spentBudgetUsd || 0);
  const budgetMax = formatMoney(worker.monthlyBudgetUsd || 0);
  
  const budgetBar = worker.monthlyBudgetUsd 
    ? renderProgressBar(worker.spentBudgetUsd || 0, worker.monthlyBudgetUsd, 15)
    : c.gray('No budget set');
  
  return [
    `${c.dim(`${String(index + 1).padStart(2, ' ')}`)} ${color(icon)} ${c.bold(name)}`,
    `      ${c.gray('Status:')} ${color(status.padEnd(12))} ${c.gray('Adapter:')} ${c.white(worker.adapter)}`,
    `      ${c.gray('Budget:')} ${budgetBar} ${c.dim(`${budget} / ${budgetMax}`)}`
  ].join('\n');
}

// Commands
async function cmdDashboard(client) {
  const s = spinner();
  s.start('Fetching system state...');

  try {
    const state = await client.getState();
    s.stop('State loaded');

    const width = 70;
    const line = c.cyan('─'.repeat(width));
    
    // Header
    console.log('\n');
    console.log(c.bgCyan(' ' + ' ULTIMATE SYSTEM '.padEnd(width - 1) + ' '));
    console.log(c.cyan(line));
    
    // Organization info
    console.log('\n' + c.bold('  Organization: ') + c.white(state.org?.name || 'Unknown'));
    console.log('  ' + c.gray('Mission: ') + c.dim(state.org?.mission || 'No mission defined'));
    
    // Budget
    const spent = state.org?.spentBudgetUsd || 0;
    const total = state.org?.monthlyBudgetUsd || 0;
    const budgetBar = total ? renderProgressBar(spent, total, 30) : c.gray('No budget');
    console.log('\n  ' + c.bold('Monthly Budget'));
    console.log(`  ${budgetBar} ${c.white(formatMoney(spent))} / ${c.dim(formatMoney(total))}`);
    
    console.log(c.cyan(line));
    
    // Quick Stats
    const stats = [
      ['Workers', state.workers?.length || 0, state.workers?.filter(w => w.status === 'busy').length || 0],
      ['Tasks', state.tasks?.length || 0, state.tasks?.filter(t => t.status === 'running').length || 0],
      ['Released', state.tasks?.filter(t => t.status === 'released').length || 0, null],
      ['Pending Approval', state.tasks?.filter(t => t.approvalState === 'pending').length || 0, null],
    ];

    console.log('\n  ' + c.bold('Quick Stats'));
    for (const [label, value, extra] of stats) {
      const extraStr = extra !== null ? c.gray(` (${extra} busy)`) : '';
      console.log(`    ${c.cyan('●')} ${c.white(label.padEnd(18))} ${c.bold(String(value))}${extraStr}`);
    }
    
    console.log(c.cyan(line));
    
    // Workers section
    if (state.workers?.length > 0) {
      console.log('\n  ' + c.bold('Workers'));
      state.workers.slice(0, 5).forEach((worker, i) => {
        console.log('  ' + renderWorkerCard(worker, i));
      });
      if (state.workers.length > 5) {
        console.log(`  ${c.dim(`... and ${state.workers.length - 5} more`)}`);
      }
    }
    
    // Tasks section
    if (state.tasks?.length > 0) {
      console.log('\n  ' + c.bold('Recent Tasks'));
      state.tasks.slice(0, 8).forEach((task, i) => {
        console.log('  ' + renderTaskCard(task, i));
      });
      if (state.tasks.length > 8) {
        console.log(`  ${c.dim(`... and ${state.tasks.length - 8} more`)}`);
      }
    }
    
    // Events section
    if (state.recentEvents?.length > 0) {
      console.log('\n  ' + c.bold('Recent Activity'));
      state.recentEvents.slice(0, 5).forEach((event) => {
        const time = formatRelativeTime(event.createdAt);
        const type = event.eventType.split('.').pop();
        console.log(`    ${c.dim(time.padEnd(8))} ${c.gray(type.padEnd(20))} ${c.white(event.actor || 'system')}`);
      });
    }
    
    console.log('\n' + c.cyan(line));
    console.log(`  ${c.dim('Connected to:')} ${c.white(client.baseUrl)}`);
    console.log(`  ${c.dim('Last updated:')} ${c.white(formatRelativeTime(new Date().toISOString()))}`);
    console.log('');
    
  } catch (err) {
    s.stop('Failed to load state');
    console.log('\n' + c.red('Error: ') + err.message);
    console.log(c.dim('Make sure the Ultimate System server is running at ') + c.cyan(client.baseUrl));
  }
}

async function cmdMonitor(client) {
  console.log('\n');
  console.log(c.bgCyan(' ' + ' MONITORING MODE '.padEnd(70) + ' '));
  console.log(c.cyan('─'.repeat(70)));
  console.log(c.yellow('  Press ') + c.bold('Ctrl+C') + c.yellow(' to exit monitoring mode\n'));
  
  let running = true;
  let lastState = null;
  
  const cleanup = () => {
    running = false;
    console.log('\n' + c.green('✓ Monitoring stopped.'));
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  while (running) {
    try {
      const state = await client.getState();
      
      // Clear screen and show header
      console.clear();
      console.log(c.bgCyan(' ' + ' ULTIMATE SYSTEM - LIVE MONITOR '.padEnd(70) + ' '));
      console.log(c.cyan('─'.repeat(70)));
      console.log(`  ${c.bold('Organization:')} ${state.org?.name || 'Unknown'}`);
      
      // Budget status
      const spent = state.org?.spentBudgetUsd || 0;
      const total = state.org?.monthlyBudgetUsd || 0;
      const budgetPct = total ? Math.round((spent / total) * 100) : 0;
      console.log(`  ${c.bold('Budget:')} ${renderProgressBar(spent, total, 25)} ${formatMoney(spent)} / ${formatMoney(total)} (${budgetPct}%)`);
      
      console.log(c.cyan('─'.repeat(70)));
      
      // Changes since last check
      if (lastState) {
        const newEvents = state.recentEvents?.filter(e => 
          !lastState.recentEvents?.find(le => le.id === e.id)
        ) || [];
        
        if (newEvents.length > 0) {
          console.log('\n  ' + c.bold('Latest Events:'));
          newEvents.slice(0, 5).forEach(event => {
            const type = event.eventType.split('.').pop();
            console.log(`    ${c.green('+')} ${c.cyan(type.padEnd(15))} ${c.white(event.actor || 'system')} ${c.dim(formatRelativeTime(event.createdAt))}`);
          });
        }
        
        const newTasks = state.tasks?.filter(t => 
          !lastState.tasks?.find(lt => lt.id === t.id)
        ) || [];
        
        if (newTasks.length > 0) {
          console.log('\n  ' + c.bold('New Tasks:'));
          newTasks.slice(0, 3).forEach(task => {
            console.log(`    ${c.green('+')} ${task.title.substring(0, 50)} [${statusColor(task.status)(task.status)}]`);
          });
        }
      }
      
      // Status summary
      const workersBusy = state.workers?.filter(w => w.status === 'busy').length || 0;
      const workersTotal = state.workers?.length || 0;
      const tasksRunning = state.tasks?.filter(t => t.status === 'running').length || 0;
      const tasksPending = state.tasks?.filter(t => t.approvalState === 'pending').length || 0;
      const tasksReleased = state.tasks?.filter(t => t.status === 'released').length || 0;
      
      console.log('\n  ' + c.bold('System Status:'));
      console.log(`    ${c.cyan('Workers:')} ${c.white(`${workersBusy} busy / ${workersTotal} total`)}`);
      console.log(`    ${c.cyan('Tasks:')} ${c.white(`${tasksRunning} running, ${tasksPending} pending approval, ${tasksReleased} released`)}`);
      
      // Active tasks
      const activeTasks = state.tasks?.filter(t => ['running', 'dispatched', 'queued'].includes(t.status)) || [];
      if (activeTasks.length > 0) {
        console.log('\n  ' + c.bold('Active Tasks:'));
        activeTasks.slice(0, 5).forEach(task => {
          console.log(`    ${statusIcon(task.status)} ${task.title.substring(0, 45)}`);
        });
      }
      
      console.log('\n' + c.cyan('─'.repeat(70)));
      console.log(`  ${c.dim('Auto-refresh:')} ${c.white('3s')}  ${c.dim('Last update:')} ${c.white(formatTime(new Date().toISOString()))}`);
      console.log(`  ${c.yellow('Ctrl+C')} ${c.dim('to stop')}`);
      
      lastState = state;
      
      // Wait before next refresh
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    } catch (err) {
      console.log(c.red('Error: ') + err.message);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }
}

async function cmdCreateTask(client) {
  intro(c.bgCyan.black(' CREATE NEW TASK '));
  
  // Title
  const title = await text({
    message: 'Task title:',
    placeholder: 'What needs to be done?',
    validate: (value) => {
      if (!value || value.trim().length === 0) return 'Title is required';
      if (value.length < 5) return 'Title must be at least 5 characters';
      return true;
    }
  });
  
  if (isCancel(title)) {
    outro(c.yellow('Task creation cancelled.'));
    return;
  }
  
  // Description
  const description = await text({
    message: 'Description:',
    placeholder: 'Provide more details about the task...',
    validate: (value) => {
      if (!value || value.trim().length === 0) return 'Description is required';
      return true;
    }
  });
  
  if (isCancel(description)) {
    outro(c.yellow('Task creation cancelled.'));
    return;
  }
  
  // Execution mode
  const executionMode = await select({
    message: 'Execution mode:',
    options: [
      { value: 'deterministic', label: 'Safe local run', hint: 'Runs verification checks locally, no AI provider' },
      { value: 'provider', label: 'AI-assisted run', hint: 'Uses AI provider for better results (may need approval)' }
    ]
  });
  
  if (isCancel(executionMode)) {
    outro(c.yellow('Task creation cancelled.'));
    return;
  }
  
  // Capabilities
  const capabilities = await multiselect({
    message: 'Required capabilities:',
    options: [
      { value: 'planning', label: 'Planning', hint: 'Break work into steps' },
      { value: 'review', label: 'Review', hint: 'Inspect and explain results' },
      { value: 'qa', label: 'Quality checks', hint: 'Run validation tests' },
      { value: 'security', label: 'Safety checks', hint: 'Look for vulnerabilities' },
      { value: 'release', label: 'Release readiness', hint: 'Decide if ready to release' }
    ],
    defaultValue: ['planning']
  });
  
  if (isCancel(capabilities)) {
    outro(c.yellow('Task creation cancelled.'));
    return;
  }
  
  // Budget
  const budgetStr = await text({
    message: 'Budget cap (USD):',
    placeholder: '15',
    defaultValue: '15',
    validate: (value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) return 'Please enter a valid amount';
      if (num > 1000) return 'Budget cannot exceed $1,000';
      return true;
    }
  });
  
  if (isCancel(budgetStr)) {
    outro(c.yellow('Task creation cancelled.'));
    return;
  }
  
  const budgetCapUsd = parseFloat(budgetStr);
  
  // Confirm
  console.log('\n');
  console.log(c.bold('Task Summary:'));
  console.log(c.gray('─'.repeat(50)));
  console.log(`  ${c.cyan('Title:')} ${c.white(title)}`);
  const descPreview = description.substring(0, 60) + (description.length > 60 ? '...' : '');
  console.log(`  ${c.cyan('Description:')} ${c.white(descPreview)}`);
  console.log(`  ${c.cyan('Mode:')} ${c.white(executionMode === 'deterministic' ? 'Safe local run' : 'AI-assisted run')}`);
  console.log(`  ${c.cyan('Capabilities:')} ${c.white(capabilities.join(', '))}`);
  console.log(`  ${c.cyan('Budget:')} ${c.white(formatMoney(budgetCapUsd))}`);
  console.log(c.gray('─'.repeat(50)));
  
  const confirmed = await confirm({
    message: 'Create this task?',
    defaultValue: true
  });
  
  if (!confirmed) {
    outro(c.yellow('Task creation cancelled.'));
    return;
  }
  
  // Create the task
  const s = spinner();
  s.start('Creating task...');
  
  try {
    const task = await client.createTask({
      title,
      description,
      executionMode,
      requiredCapabilities: capabilities,
      budgetCapUsd,
      requestedBy: program.opts().email || 'cli-user'
    });
    
    s.stop('Task created');
    
    console.log('\n');
    note(
      `Task ID: ${task.id}\nStatus: ${task.status}\nApproval: ${task.approvalState}`,
      'Task Created Successfully'
    );
    
    if (task.approvalState === 'pending') {
      console.log(c.yellow('\n⚠ This task requires approval before it can start.'));
    }
    
  } catch (err) {
    s.stop('Failed to create task');
    console.log('\n' + c.red('Error: ') + err.message);
  }
  
  outro('Ready.');
}

async function cmdApprove(client) {
  intro(c.bgGreen.black(' APPROVE TASKS '));
  
  const s = spinner();
  s.start('Loading pending tasks...');
  
  try {
    const tasks = await client.getTasks();
    s.stop();
    
    const pending = tasks.filter(t => t.approvalState === 'pending');
    
    if (pending.length === 0) {
      note('No tasks are waiting for approval.', 'All Clear');
      outro('Ready.');
      return;
    }
    
    console.log('\n' + c.bold(`Found ${pending.length} task(s) waiting for approval:\n`));
    
    pending.forEach((task, i) => {
      console.log(`  ${c.cyan(String(i + 1) + '.')} ${c.bold(task.title)}`);
      console.log(`     ${c.gray('Budget:')} ${formatMoney(task.budgetCapUsd)} | ${c.gray('Mode:')} ${task.executionMode}`);
      console.log(`     ${c.gray('By:')} ${task.requestedBy}`);
      console.log('');
    });
    
    const selected = await select({
      message: 'Select a task to review:',
      options: pending.map(t => ({
        value: t.id,
        label: t.title.substring(0, 50),
        hint: `${t.executionMode} • ${formatMoney(t.budgetCapUsd)}`
      }))
    });
    
    if (isCancel(selected)) {
      outro('Cancelled.');
      return;
    }
    
    const taskDetail = await client.getTask(selected);
    const task = taskDetail.task;
    
    console.log('\n' + c.bold('Task Details:'));
    console.log(c.gray('─'.repeat(50)));
    console.log(`  ${c.cyan('Title:')} ${c.white(task.title)}`);
    console.log(`  ${c.cyan('Description:')}`);
    console.log(`    ${c.dim(task.description)}`);
    console.log(`  ${c.cyan('Mode:')} ${c.white(task.executionMode)}`);
    console.log(`  ${c.cyan('Budget:')} ${c.white(formatMoney(task.budgetCapUsd))}`);
    console.log(`  ${c.cyan('Capabilities:')} ${c.white(task.requiredCapabilities.join(', '))}`);
    console.log(c.gray('─'.repeat(50)));
    
    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'approve', label: 'Approve', hint: 'Allow this task to proceed' },
        { value: 'reject', label: 'Reject', hint: 'Deny this task' },
        { value: 'view', label: 'View full details', hint: 'See complete task information' }
      ]
    });
    
    if (isCancel(action)) {
      outro('Cancelled.');
      return;
    }
    
    if (action === 'view') {
      console.log('\n' + c.bold('Full Task Information:'));
      console.log(JSON.stringify(task, null, 2));
      outro('Ready.');
      return;
    }
    
    const reason = await text({
      message: 'Reason (optional):',
      placeholder: 'Brief explanation for your decision...',
      defaultValue: action === 'approve' 
        ? 'Approved - task meets requirements' 
        : 'Rejected - please revise and resubmit'
    });
    
    if (isCancel(reason)) {
      outro('Cancelled.');
      return;
    }
    
    const confirmAction = await confirm({
      message: `${action === 'approve' ? 'Approve' : 'Reject'} this task?`,
      defaultValue: true
    });
    
    if (!confirmAction) {
      outro('Cancelled.');
      return;
    }
    
    const s2 = spinner();
    s2.start(`${action === 'approve' ? 'Approving' : 'Rejecting'} task...`);
    
    await client.approveTask(task.id, action === 'approve', reason || '');
    
    s2.stop(`Task ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
    note(`Task "${task.title}" has been ${action === 'approve' ? 'approved' : 'rejected'}.`, 'Success');
    
  } catch (err) {
    s.stop('Failed to load tasks');
    console.log('\n' + c.red('Error: ') + err.message);
  }
  
  outro('Ready.');
}

async function cmdListTasks(client) {
  const s = spinner();
  s.start('Loading tasks...');
  
  try {
    const tasks = await client.getTasks();
    s.stop();
    
    if (tasks.length === 0) {
      note('No tasks found.', 'Empty State');
      return;
    }
    
    // Group by status
    const groups = {
      pending: tasks.filter(t => t.approvalState === 'pending'),
      queued: tasks.filter(t => t.status === 'queued' || t.status === 'dispatched'),
      running: tasks.filter(t => t.status === 'running'),
      completed: tasks.filter(t => t.status === 'completed'),
      released: tasks.filter(t => t.status === 'released'),
      failed: tasks.filter(t => t.status === 'failed')
    };
    
    console.log('\n');
    console.log(c.bgCyan(' ' + ` TASKS (${tasks.length}) `.padEnd(60) + ' '));
    console.log(c.cyan('─'.repeat(62)));
    
    const groupLabels = {
      pending: { label: 'Pending Approval', color: 'yellow' },
      queued: { label: 'Queued/Waiting', color: 'cyan' },
      running: { label: 'In Progress', color: 'cyan' },
      completed: { label: 'Completed (Review)', color: 'yellow' },
      released: { label: 'Released', color: 'green' },
      failed: { label: 'Failed', color: 'red' }
    };
    
    for (const [status, groupTasks] of Object.entries(groups)) {
      if (groupTasks.length === 0) continue;
      
      const { label, color } = groupLabels[status];
      console.log('\n  ' + c[color].bold(label + ':'));
      
      groupTasks.forEach((task, i) => {
        console.log('    ' + renderTaskCard(task, i));
      });
    }
    
    console.log('\n' + c.cyan('─'.repeat(62)));
    console.log(`  ${c.dim('Use:')} ultimate task <id> ${c.dim('for details')}`);
    console.log('');
    
  } catch (err) {
    s.stop('Failed to load tasks');
    console.log('\n' + c.red('Error: ') + err.message);
  }
}

async function cmdTaskDetail(client, taskId) {
  const s = spinner();
  s.start('Loading task details...');
  
  try {
    const detail = await client.getTask(taskId);
    s.stop();
    
    const task = detail.task;
    
    console.log('\n');
    console.log(c.bgCyan(' ' + ` TASK DETAIL `.padEnd(60) + ' '));
    console.log(c.cyan('─'.repeat(62)));
    
    console.log('\n  ' + c.bold('Basic Information:'));
    console.log(`    ${c.cyan('ID:')} ${c.white(task.id)}`);
    console.log(`    ${c.cyan('Title:')} ${c.white(task.title)}`);
    console.log(`    ${c.cyan('Status:')} ${statusColor(task.status)(task.status)}`);
    console.log(`    ${c.cyan('Approval:')} ${statusColor(task.approvalState)(task.approvalState)}`);
    console.log(`    ${c.cyan('Mode:')} ${c.white(task.executionMode)}`);
    console.log(`    ${c.cyan('Budget:')} ${c.white(formatMoney(task.budgetCapUsd))}`);
    console.log(`    ${c.cyan('Actual Cost:')} ${c.white(formatMoney(task.budgetActualUsd || 0))}`);
    
    console.log('\n  ' + c.bold('Description:'));
    console.log(`    ${c.dim(task.description)}`);
    
    console.log('\n  ' + c.bold('Capabilities:'));
    console.log(`    ${c.white(task.requiredCapabilities.join(', '))}`);
    
    if (task.resultSummary) {
      console.log('\n  ' + c.bold('Result:'));
      console.log(`    ${c.dim(task.resultSummary)}`);
    }
    
    if (task.lastError) {
      console.log('\n  ' + c.red('Error:'));
      console.log(`    ${c.red(task.lastError)}`);
    }
    
    // Gates
    if (detail.gates?.length > 0) {
      console.log('\n  ' + c.bold('Gates:'));
      detail.gates.forEach(gate => {
        const icon = statusIcon(gate.status);
        const color = statusColor(gate.status);
        console.log(`    ${color(icon)} ${gate.gateType.padEnd(12)} ${c.gray(gate.evidence?.summary || '')}`);
      });
    }
    
    // Recent events
    if (detail.events?.length > 0) {
      console.log('\n  ' + c.bold('Recent Events:'));
      detail.events.slice(0, 5).forEach(event => {
        console.log(`    ${c.gray(formatRelativeTime(event.createdAt).padEnd(8))} ${event.eventType.split('.').pop().padEnd(15)} ${c.dim(event.actor || 'system')}`);
      });
    }
    
    console.log('\n' + c.cyan('─'.repeat(62)));
    console.log('');
    
  } catch (err) {
    s.stop('Failed to load task');
    console.log('\n' + c.red('Error: ') + err.message);
  }
}

async function cmdLogin(client) {
  intro(c.bgMagenta.black(' LOGIN '));
  
  const email = await text({
    message: 'Email:',
    placeholder: 'admin@company.com',
    validate: (value) => {
      if (!value || !value.includes('@')) return 'Please enter a valid email';
      return true;
    }
  });
  
  if (isCancel(email)) {
    outro('Cancelled.');
    return;
  }
  
  const password = await text({
    message: 'Password:',
    placeholder: 'Enter password',
    validate: (value) => {
      if (!value || value.length < 1) return 'Password is required';
      return true;
    }
  });
  
  if (isCancel(password)) {
    outro('Cancelled.');
    return;
  }
  
  const s = spinner();
  s.start('Signing in...');
  
  try {
    await client.login(email, password);
    s.stop('Signed in successfully');
    note(`Logged in as ${email}`, 'Success');
  } catch (err) {
    s.stop('Login failed');
    console.log('\n' + c.red('Error: ') + err.message);
  }
  
  outro('Ready.');
}

async function cmdListWorkers(client) {
  const s = spinner();
  s.start('Loading workers...');
  
  try {
    const workers = await client.getWorkers();
    s.stop();
    
    if (workers.length === 0) {
      note('No workers found.', 'Empty State');
      return;
    }
    
    console.log('\n');
    console.log(c.bgCyan(' ' + ` WORKERS (${workers.length}) `.padEnd(60) + ' '));
    console.log(c.cyan('─'.repeat(62)));
    
    workers.forEach((worker, i) => {
      console.log('\n' + renderWorkerCard(worker, i));
      console.log(`      ${c.gray('Capabilities:')} ${c.white(worker.capabilities?.join(', ') || 'none')}`);
      console.log(`      ${c.gray('Modes:')} ${c.white(worker.executionModes?.join(', ') || 'none')}`);
      if (worker.lastHeartbeatAt) {
        console.log(`      ${c.gray('Last heartbeat:')} ${c.white(formatRelativeTime(worker.lastHeartbeatAt))}`);
      }
    });
    
    console.log('\n' + c.cyan('─'.repeat(62)));
    console.log('');
    
  } catch (err) {
    s.stop('Failed to load workers');
    console.log('\n' + c.red('Error: ') + err.message);
  }
}

// Main CLI setup
program
  .name('ultimate')
  .description(c.cyan('Ultimate System - Beautiful orchestration CLI'))
  .version('1.0.0')
  .option('-e, --email <email>', 'User email for authentication')
  .option('-k, --api-key <key>', 'API key (alternative to login)')
  .option('-u, --url <url>', 'API base URL', API_BASE);

// Default command - show dashboard
program.action(async (options) => {
  const client = new UltimateClient(options.url);
  await cmdDashboard(client, options);
});

// Dashboard command
program
  .command('dashboard')
  .alias('dash')
  .description('View the system dashboard')
  .action(async (options) => {
    const client = new UltimateClient(program.opts().url);
    await cmdDashboard(client, options);
  });

// Monitor command
program
  .command('monitor')
  .alias('watch')
  .description('Monitor the system in real-time')
  .action(async (options) => {
    const client = new UltimateClient(program.opts().url);
    await cmdMonitor(client, options);
  });

// Create task command
program
  .command('create')
  .alias('new')
  .description('Create a new task')
  .action(async (options) => {
    const client = new UltimateClient(program.opts().url);
    await cmdCreateTask(client, { ...options, email: program.opts().email });
  });

// Approve command
program
  .command('approve')
  .alias('review')
  .description('Review and approve pending tasks')
  .action(async () => {
    const client = new UltimateClient(program.opts().url);
    await cmdApprove(client);
  });

// Tasks command
program
  .command('tasks')
  .alias('list')
  .description('List all tasks')
  .action(async () => {
    const client = new UltimateClient(program.opts().url);
    await cmdListTasks(client);
  });

// Task detail command
program
  .command('task <id>')
  .description('Show detailed information about a task')
  .action(async (taskId) => {
    const client = new UltimateClient(program.opts().url);
    await cmdTaskDetail(client, taskId);
  });

// Workers command
program
  .command('workers')
  .description('List all workers')
  .action(async () => {
    const client = new UltimateClient(program.opts().url);
    await cmdListWorkers(client);
  });

// Login command
program
  .command('login')
  .description('Sign in to the system')
  .action(async () => {
    const client = new UltimateClient(program.opts().url);
    await cmdLogin(client);
  });

// Help command
program
  .command('help')
  .description('Show help information')
  .action(() => {
    console.log('\n');
    console.log(c.bgCyan(' ' + ' ULTIMATE SYSTEM CLI HELP '.padEnd(60) + ' '));
    console.log(c.cyan('─'.repeat(62)));
    console.log('\n  ' + c.bold('Commands:'));
    console.log(`    ${c.cyan('ultimate dashboard')}     ${c.dim('View system dashboard (default)')}`);
    console.log(`    ${c.cyan('ultimate monitor')}        ${c.dim('Watch system in real-time')}`);
    console.log(`    ${c.cyan('ultimate create')}         ${c.dim('Create a new task')}`);
    console.log(`    ${c.cyan('ultimate approve')}        ${c.dim('Review pending tasks')}`);
    console.log(`    ${c.cyan('ultimate tasks')}          ${c.dim('List all tasks')}`);
    console.log(`    ${c.cyan('ultimate task <id>')}      ${c.dim('Show task details')}`);
    console.log(`    ${c.cyan('ultimate workers')}        ${c.dim('List all workers')}`);
    console.log(`    ${c.cyan('ultimate login')}         ${c.dim('Sign in')}`);
    console.log('\n  ' + c.bold('Options:'));
    console.log(`    ${c.cyan('-u, --url <url>')}          ${c.dim('API base URL')}`);
    console.log(`    ${c.cyan('-e, --email <email>')}      ${c.dim('User email')}`);
    console.log('\n  ' + c.bold('Examples:'));
    console.log(`    ${c.green('ultimate')}                   ${c.dim('Show dashboard')}`);
    console.log(`    ${c.green('ultimate monitor')}            ${c.dim('Start monitoring')}`);
    console.log(`    ${c.green('ultimate create')}             ${c.dim('Create a task')}`);
    console.log(`    ${c.green('ultimate task abc123')}        ${c.dim('View task abc123')}`);
    console.log(`    ${c.green('ultimate -u http://localhost:4100')}`);
    console.log('\n' + c.cyan('─'.repeat(62)));
    console.log('');
  });

program.parse(process.argv);

// ============================================================================
// MONETIZATION COMMANDS
// ============================================================================

async function cmdServices(client, options) {
  intro(c.bgMagenta.black(' SERVICE CATALOG '));
  
  console.log('\n' + c.bold('Available Services:\n'));
  
  const { SERVICE_CATALOG, calculateServiceMargin } = await import('./services.js');
  
  SERVICE_CATALOG.forEach((service, i) => {
    const margin = calculateServiceMargin(service);
    console.log(c.cyan(`${String(i + 1).padStart(2, ' ')}. ${service.name}`));
    console.log(`   ${c.dim(service.description)}`);
    console.log(`   ${c.gray('Price:')} ${c.green(formatMoney(service.price))} | ${c.gray('Delivery:')} ${c.white(service.deliveryTime)}`);
    console.log(`   ${c.gray('Margin:')} ${c.yellow(`${margin.marginPercent}%`)} (${c.green(formatMoney(margin.profit))} profit)`);
    console.log('');
  });
  
  outro('Ready.');
}

async function cmdCreateService() {
  intro(c.bgGreen.black(' CREATE SERVICE ORDER '));
  
  const { SERVICE_CATALOG, createTaskFromService } = await import('./services.js');
  
  const service = await select({
    message: 'Select a service:',
    options: SERVICE_CATALOG.map(s => ({
      value: s.id,
      label: s.name,
      hint: formatMoney(s.price)
    }))
  });
  
  if (isCancel(service)) {
    outro('Cancelled.');
    return;
  }
  
  const notes = await text({
    message: 'Client notes (optional):',
    placeholder: 'Any special requirements...'
  });
  
  if (isCancel(notes)) {
    outro('Cancelled.');
    return;
  }
  
  const s = spinner();
  s.start('Creating service order...');
  
  try {
    const taskData = createTaskFromService(service, notes || '');
    const client = new UltimateClient(program.opts().url);
    const task = await client.createTask(taskData);
    
    s.stop('Order created');
    
    console.log('\n');
    note(
      `Service: ${service}\nTask ID: ${task.id}\nPrice: ${formatMoney(taskData.servicePrice)}\nStatus: ${task.status}`,
      'Service Order Created'
    );
    
  } catch (err) {
    s.stop('Failed to create order');
    console.log('\n' + c.red('Error: ') + err.message);
  }
  
  outro('Ready.');
}

async function cmdClients() {
  intro(c.bgCyan.black(' CLIENT MANAGEMENT '));
  
  const { listClients, getRevenueReport } = await import('./clients.js');
  
  const action = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'list', label: 'List all clients' },
      { value: 'add', label: 'Add new client' },
      { value: 'revenue', label: 'View revenue report' },
      { value: 'orders', label: 'View recent orders' }
    ]
  });
  
  if (isCancel(action)) {
    outro('Cancelled.');
    return;
  }
  
  switch (action) {
    case 'list': {
      const clients = listClients();
      if (clients.length === 0) {
        note('No clients yet.', 'Empty');
      } else {
        console.log('\n' + c.bold('Clients:\n'));
        clients.forEach(client => {
          console.log(`  ${c.cyan(client.name)} (${c.dim(client.email)})`);
          console.log(`     ${c.gray('Orders:')} ${c.white(client.totalOrders)} | ${c.gray('Spent:')} ${c.green(formatMoney(client.totalSpent))}`);
          console.log('');
        });
      }
      break;
    }
    
    case 'add': {
      const name = await text({ message: 'Client name:' });
      if (isCancel(name)) { outro('Cancelled.'); return; }
      
      const email = await text({ message: 'Email:' });
      if (isCancel(email)) { outro('Cancelled.'); return; }
      
      const { createClient } = await import('./clients.js');
      const client = createClient({ name, email });
      
      note(`Client ID: ${client.id}`, 'Client created');
      break;
    }
    
    case 'revenue': {
      const today = new Date().toISOString().split('T')[0];
      const report = getRevenueReport(new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString(), today);
      
      console.log('\n' + c.bold('Revenue Report (Last 30 days):\n'));
      console.log(`  ${c.cyan('Total Orders:')} ${c.white(report.totalOrders)}`);
      console.log(`  ${c.cyan('Revenue:')} ${c.green(formatMoney(report.revenue))}`);
      console.log(`  ${c.cyan('Costs:')} ${c.red(formatMoney(report.cost))}`);
      console.log(`  ${c.cyan('Profit:')} ${c.green(formatMoney(report.profit))}`);
      console.log(`  ${c.cyan('Margin:')} ${c.yellow(`${report.margin}%`)}`);
      console.log('');
      break;
    }
    
    case 'orders': {
      const { listOrders } = await import('./clients.js');
      const orders = listOrders(null, 'all').slice(0, 10);
      
      if (orders.length === 0) {
        note('No orders yet.', 'Empty');
      } else {
        console.log('\n' + c.bold('Recent Orders:\n'));
        orders.forEach(order => {
          const statusColor = order.status === 'completed' ? 'green' : order.status === 'failed' ? 'red' : 'yellow';
          console.log(`  ${c[statusColor](order.id.substring(0, 8))} - ${c.white(order.serviceId)}`);
          console.log(`     ${c.gray('Client:')} ${c.white(order.clientId.substring(0, 8))} | ${c.gray('Profit:')} ${c.green(formatMoney(order.profit))}`);
          console.log('');
        });
      }
      break;
    }
  }
  
  outro('Ready.');
}

async function cmdAutomate() {
  intro(c.bgMagenta.black(' AUTOMATION WORKFLOWS '));
  
  const { WORKFLOWS, executeWorkflow } = await import('./automation.js');
  
  const workflow = await select({
    message: 'Select a workflow to run:',
    options: Object.values(WORKFLOWS).map(w => ({
      value: w.id,
      label: w.name,
      hint: w.schedule || 'Manual'
    }))
  });
  
  if (isCancel(workflow)) {
    outro('Cancelled.');
    return;
  }
  
  const selectedWorkflow = WORKFLOWS[workflow];
  
  console.log('\n' + c.bold('Starting workflow:\n'));
  console.log(`  ${c.cyan('Name:')} ${c.white(selectedWorkflow.name)}`);
  console.log(`  ${c.cyan('Steps:')} ${c.white(selectedWorkflow.steps.length)}`);
  console.log('');
  
  const result = await executeWorkflow(selectedWorkflow);
  
  if (result.status === 'completed') {
    note('Workflow completed successfully', '✓ Success');
  } else {
    console.log('\n' + c.red('Workflow failed:\n'));
    result.errors.forEach(err => {
      console.log(`  ${c.red('✗')} ${err}`);
    });
  }
  
  outro('Ready.');
}

// Add monetization commands to CLI
program
  .command('services')
  .alias('catalog')
  .description('View available services')
  .action(async () => {
    const client = new UltimateClient(program.opts().url);
    await cmdServices(client);
  });

program
  .command('order')
  .alias('create-service')
  .description('Create a service order')
  .action(async () => {
    await cmdCreateService();
  });

program
  .command('clients')
  .description('Manage clients and view revenue')
  .action(async () => {
    await cmdClients();
  });

program
  .command('automate')
  .alias('workflow')
  .description('Run automation workflows')
  .action(async () => {
    await cmdAutomate();
  });
