const http = require('http');
const https = require('https');

const supaUrl = 'https://qivqgupticekunfhkvwf.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdnFndXB0aWNla3VuZmhrdndmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0OTY3MjAsImV4cCI6MjA4NjA3MjcyMH0.njsl6uwyyzS1Il5Q34ByUZQFgQlMJDuNcbCeRGT7b1w';

async function getToken() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: 'support@dropdeadhair.com', password: '36YefHho2ZrNkHVqnAYx' });
    const url = new URL(supaUrl + '/auth/v1/token?grant_type=password');
    const req = https.request(url, {
      method: 'POST',
      headers: { 'apikey': anonKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).access_token));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callFileAPI(token, fileId) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000/api/files/${fileId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
  });
}

async function main() {
  const token = await getToken();
  console.log('Token obtained, length:', token.length);

  const fileId = 'd31125a8-0a11-45bb-8567-732cb517b7d3';
  const result = await callFileAPI(token, fileId);
  console.log('File API status:', result.status);

  if (result.status === 200) {
    const json = JSON.parse(result.body);
    const content = json.data?.content || '';
    console.log('Content length:', content.length);
    console.log('Has available-lengths:', content.includes('available-lengths'));
    console.log('Has __LENGTH_OPTION_INDEX__:', content.includes('__LENGTH_OPTION_INDEX__'));
    console.log('Has restock-badge:', content.includes('restock-badge'));
  } else {
    console.log('Response:', result.body.substring(0, 300));
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
