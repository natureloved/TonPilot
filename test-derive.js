const https = require('https');
const crypto = require('crypto');

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

function decodeMnemonic(val) {
    if (!val) return null;
    return Buffer.from(val, "base64").toString("utf-8");
}

async function main() {
  const users = await request(`${supabaseUrl}/rest/v1/users?select=*`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  
  console.log("Found", users.length, "users.");
  for(const user of users) {
     console.log("---");
     console.log("User:", user.id);
     console.log("DB Address:", user.wallet_address);
     const mnemonic = decodeMnemonic(user.wallet_mnemonic_enc);
     console.log("Mnemonic Words:", mnemonic ? mnemonic.split(" ").length : 0);
     if (mnemonic) {
         console.log("First word:", mnemonic.split(" ")[0]);
     }
  }
}
main();
