// Vercel Edge Function: Auth Session Proxy
// Proxies to the Control Plane backend

export const config = {
  runtime: 'edge',
};

// Backend URL from environment variable
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:4100';

export default async function handler(request: Request) {
  // Only allow GET requests for session check
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Forward cookies to backend
    const cookie = request.headers.get('cookie') || '';
    
    const response = await fetch(`${CONTROL_PLANE_URL}/api/auth/session`, {
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    });
  } catch (error) {
    console.error('Auth session proxy error:', error);
    return new Response(JSON.stringify({
      authenticated: false,
      error: 'Backend unavailable'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}