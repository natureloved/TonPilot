const https = require('https');

const supabaseUrl = 'https://qexlayennlznthzvoale.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleGxheWVubmx6bnRoenZvYWxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzMyMTAxNywiZXhwIjoyMDg4ODk3MDE3fQ.bvGFc25la9ciZZ5R3nJlTVGWc-FtuALDZJYzjrdqCks';

function request(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const users = await request(`${supabaseUrl}/rest/v1/users?select=*`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  
  const u = users[0];
  console.log("Raw Enc:", u.wallet_mnemonic_enc);
  const buf = Buffer.from(u.wallet_mnemonic_enc, "base64");
  console.log("Hex:", buf.toString('hex').slice(0,30));
  console.log("UTF8:", buf.toString('utf-8').slice(0,30));
}
main();
