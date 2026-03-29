/**
 * Ultimate System Client Management
 * 
 * Manage clients, track orders, and handle billing.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = join(process.cwd(), '.ultimate', 'clients');
const ensureDataDir = () => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
};

// Client schema
export function createClient(data) {
  ensureDataDir();
  
  const client = {
    id: randomUUID(),
    name: data.name,
    email: data.email,
    company: data.company || null,
    phone: data.phone || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    totalSpent: 0,
    totalOrders: 0,
    paymentMethod: data.paymentMethod || 'invoice',
    notes: data.notes || '',
    metadata: data.metadata || {}
  };
  
  const filePath = join(DATA_DIR, `${client.id}.json`);
  writeFileSync(filePath, JSON.stringify(client, null, 2));
  
  return client;
}

export function getClient(clientId) {
  const filePath = join(DATA_DIR, `${clientId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function updateClient(clientId, updates) {
  const client = getClient(clientId);
  if (!client) {
    throw new Error(`Client ${clientId} not found`);
  }
  
  const updated = {
    ...client,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  const filePath = join(DATA_DIR, `${clientId}.json`);
  writeFileSync(filePath, JSON.stringify(updated, null, 2));
  
  return updated;
}

export function listClients(status = 'all') {
  ensureDataDir();
  
  const files = require('node:fs').readdirSync(DATA_DIR);
  const clients = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  
  if (status !== 'all') {
    return clients.filter(c => c.status === status);
  }
  
  return clients;
}

export function deleteClient(clientId) {
  const filePath = join(DATA_DIR, `${clientId}.json`);
  if (existsSync(filePath)) {
    require('node:fs').unlinkSync(filePath);
    return true;
  }
  return false;
}

// Order tracking
export function createOrder(clientId, serviceId, orderData) {
  const client = getClient(clientId);
  if (!client) {
    throw new Error(`Client ${clientId} not found`);
  }
  
  const order = {
    id: randomUUID(),
    clientId,
    serviceId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null,
    deliveredAt: null,
    price: orderData.price,
    cost: orderData.cost || 0,
    profit: orderData.price - (orderData.cost || 0),
    taskId: null,
    deliverables: [],
    notes: orderData.notes || '',
    metadata: orderData.metadata || {}
  };
  
  const ordersDir = join(DATA_DIR, 'orders');
  if (!existsSync(ordersDir)) {
    mkdirSync(ordersDir, { recursive: true });
  }
  
  const filePath = join(ordersDir, `${order.id}.json`);
  writeFileSync(filePath, JSON.stringify(order, null, 2));
  
  // Update client stats
  updateClient(clientId, {
    totalSpent: client.totalSpent + order.price,
    totalOrders: client.totalOrders + 1
  });
  
  return order;
}

export function getOrder(orderId) {
  const ordersDir = join(DATA_DIR, 'orders');
  const filePath = join(ordersDir, `${orderId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function updateOrder(orderId, updates) {
  const order = getOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  const updated = { ...order, ...updates };
  
  const ordersDir = join(DATA_DIR, 'orders');
  const filePath = join(ordersDir, `${orderId}.json`);
  writeFileSync(filePath, JSON.stringify(updated, null, 2));
  
  return updated;
}

export function listOrders(clientId = null, status = 'all') {
  const ordersDir = join(DATA_DIR, 'orders');
  if (!existsSync(ordersDir)) {
    return [];
  }
  
  const files = require('node:fs').readdirSync(ordersDir);
  const orders = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(ordersDir, f), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  
  let filtered = orders;
  if (clientId) {
    filtered = filtered.filter(o => o.clientId === clientId);
  }
  if (status !== 'all') {
    filtered = filtered.filter(o => o.status === status);
  }
  
  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Revenue tracking
export function getRevenueReport(startDate, endDate) {
  const orders = listOrders(null, 'all');
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const filtered = orders.filter(o => {
    const orderDate = new Date(o.createdAt);
    return orderDate >= start && orderDate <= end;
  });
  
  const totalRevenue = filtered.reduce((sum, o) => sum + o.price, 0);
  const totalCost = filtered.reduce((sum, o) => sum + o.cost, 0);
  const totalProfit = filtered.reduce((sum, o) => sum + o.profit, 0);
  
  return {
    period: { start: startDate, end: endDate },
    totalOrders: filtered.length,
    completedOrders: filtered.filter(o => o.status === 'completed').length,
    revenue: Math.round(totalRevenue * 100) / 100,
    cost: Math.round(totalCost * 100) / 100,
    profit: Math.round(totalProfit * 100) / 100,
    margin: Math.round((totalProfit / totalRevenue) * 100) || 0,
    averageOrderValue: Math.round((totalRevenue / filtered.length) * 100) / 100 || 0
  };
}
