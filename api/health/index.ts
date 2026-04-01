// Vercel Edge Function: Health Check
// This is a lightweight health endpoint for Vercel deployment

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'auto-web',
    runtime: 'edge'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    }
  });
}