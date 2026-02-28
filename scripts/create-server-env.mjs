import fs from 'fs';

const keys = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_AI_API_KEY',
  'ENCRYPTION_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

const env = Object.fromEntries(
  keys.filter((k) => process.env[k]).map((k) => [k, process.env[k]])
);

fs.writeFileSync('server.env.json', JSON.stringify(env, null, 2));
console.log('Wrote server.env.json with keys:', Object.keys(env).join(', '));
