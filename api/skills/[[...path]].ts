// Vercel Edge Function: Skills Proxy
// Proxies skills requests to the Control Plane backend

export const config = {
  runtime: 'edge',
};

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || 'http://localhost:4100';

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/skills', '/api/skills');
  const query = url.search;
  
  try {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    
    // Forward API key if present
    const apiKey = request.headers.get('x-api-key');
    if (apiKey) {
      headers.set('x-api-key', apiKey);
    }
    
    // Forward cookies
    const cookie = request.headers.get('cookie');
    if (cookie) {
      headers.set('Cookie', cookie);
    }

    const response = await fetch(`${CONTROL_PLANE_URL}${path}${query}`, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined
    });

    const responseHeaders = new Headers({
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('Skills proxy error:', error);
    return new Response(JSON.stringify({
      error: 'Backend unavailable',
      available: false
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}