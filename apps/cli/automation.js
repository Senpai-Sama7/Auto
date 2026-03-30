/**
 * Ultimate System Automation Engine
 * 
 * Automated workflows for recurring revenue services.
 */

import { spawn } from 'node:child_process';

const API_BASE = process.env.ULTIMATE_SYSTEM_API_BASE || 'http://localhost:4100';

// Workflow executor
export async function executeWorkflow(workflow) {
  console.log(`🚀 Starting workflow: ${workflow.name}`);
  
  const results = {
    workflowId: workflow.id,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'running',
    steps: [],
    errors: []
  };
  
  for (const step of workflow.steps) {
    try {
      console.log(`  → Executing: ${step.name}`);
      
      const stepResult = await executeStep(step);
      results.steps.push({
        name: step.name,
        status: 'completed',
        result: stepResult,
        completedAt: new Date().toISOString()
      });
      
      console.log(`  ✓ Completed: ${step.name}`);
    } catch (error) {
      console.error(`  ✗ Failed: ${step.name} - ${error.message}`);
      results.steps.push({
        name: step.name,
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString()
      });
      results.errors.push(error.message);
      
      if (step.stopOnError) {
        results.status = 'failed';
        results.completedAt = new Date().toISOString();
        return results;
      }
    }
  }
  
  results.status = 'completed';
  results.completedAt = new Date().toISOString();
  console.log(`✓ Workflow completed: ${workflow.name}`);
  
  return results;
}

async function executeStep(step) {
  switch (step.type) {
    case 'task':
      return await createTask(step.config);
    case 'command':
      return await runCommand(step.command);
    case 'notification':
      return await sendNotification(step.config);
    case 'webhook':
      return await triggerWebhook(step.config);
    case 'delay':
      return await delay(step.ms);
    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

async function createTask(config) {
  const response = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: config.title,
      description: config.description,
      executionMode: config.executionMode || 'deterministic',
      requiredCapabilities: config.capabilities || [],
      budgetCapUsd: config.budget || 10,
      requestedBy: config.requestedBy || 'automation'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Task creation failed: ${response.statusText}`);
  }
  
  return await response.json();
}

async function runCommand(command) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, { shell: true });
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => { stdout += data; });
    proc.stderr.on('data', data => { stderr += data; });
    proc.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

async function sendNotification(config) {
  // Placeholder for email/Slack integration
  console.log(`📧 Notification: ${config.message}`);
  return { sent: true, channel: config.channel };
}

async function triggerWebhook(config) {
  const response = await fetch(config.url, {
    method: config.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config.payload || {})
  });
  return await response.json();
}

async function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

// Pre-built workflows
export const WORKFLOWS = {
  daily_security_scan: {
    id: 'daily_security_scan',
    name: 'Daily Security Scan',
    schedule: '0 2 * * *', // Daily at 2 AM
    steps: [
      {
        type: 'task',
        name: 'Run security audit',
        config: {
          title: 'Daily Security Audit',
          description: 'Automated daily security scan',
          executionMode: 'provider',
          capabilities: ['security', 'review'],
          budget: 15
        },
        stopOnError: true
      },
      {
        type: 'notification',
        name: 'Send report',
        config: {
          channel: 'email',
          message: 'Daily security scan completed'
        }
      }
    ]
  },
  
  weekly_code_review: {
    id: 'weekly_code_review',
    name: 'Weekly Code Review',
    schedule: '0 9 * * 1', // Weekly on Monday at 9 AM
    steps: [
      {
        type: 'task',
        name: 'Code review',
        config: {
          title: 'Weekly Code Quality Review',
          description: 'Comprehensive weekly code review',
          executionMode: 'provider',
          capabilities: ['review', 'qa'],
          budget: 25
        },
        stopOnError: true
      },
      {
        type: 'task',
        name: 'Generate report',
        config: {
          title: 'Generate Weekly Quality Report',
          description: 'Compile findings into report',
          executionMode: 'deterministic',
          capabilities: ['planning'],
          budget: 5
        }
      },
      {
        type: 'notification',
        name: 'Deliver report',
        config: {
          channel: 'email',
          message: 'Weekly code review report ready'
        }
      }
    ]
  },
  
  client_onboarding: {
    id: 'client_onboarding',
    name: 'Client Onboarding Package',
    schedule: null, // Manual trigger
    steps: [
      {
        type: 'task',
        name: 'Security baseline',
        config: {
          title: 'Client Security Baseline Audit',
          description: 'Initial security assessment for new client',
          executionMode: 'provider',
          capabilities: ['security'],
          budget: 50
        },
        stopOnError: false
      },
      {
        type: 'task',
        name: 'Code quality check',
        config: {
          title: 'Client Code Quality Assessment',
          description: 'Initial code quality review',
          executionMode: 'provider',
          capabilities: ['review', 'qa'],
          budget: 40
        },
        stopOnError: false
      },
      {
        type: 'task',
        name: 'Documentation review',
        config: {
          title: 'Documentation Completeness Check',
          description: 'Review existing documentation',
          executionMode: 'deterministic',
          capabilities: ['planning', 'review'],
          budget: 20
        }
      },
      {
        type: 'notification',
        name: 'Send onboarding report',
        config: {
          channel: 'email',
          message: 'Client onboarding assessment complete'
        }
      }
    ]
  }
};

// Schedule workflow (cron-based)
export function scheduleWorkflow(workflow) {
  const cron = require('node-cron');
  
  if (!workflow.schedule) {
    throw new Error('Workflow has no schedule');
  }
  
  console.log(`⏰ Scheduling workflow: ${workflow.name} (${workflow.schedule})`);
  
  return cron.schedule(workflow.schedule, async () => {
    console.log(`🕐 Triggering scheduled workflow: ${workflow.name}`);
    await executeWorkflow(workflow);
  });
}
