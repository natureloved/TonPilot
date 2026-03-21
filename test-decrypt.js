const crypto = require('crypto');

const ENCRYPTION_KEY = Buffer.from("1a3e8ec10a5b5b45d08b7ead444f9ff07d17fdb3a5ad1e1ba41ae6654a8d9636", "hex"); // 32 bytes
const dbString = "2725da274c140c172abbe8280de71e45:41110ce31f21160e7f0bc3842b7145f71d316a4c71f6839ab539a6632b637d8fd008cbf25ba0e924435e76e10493cf81d81ae40395834c866736d7572af406b55819f17b7144017ba0baeaf412261d2558c16651909d91e27b5cf192b6fbdf16042ba97aa3cd6a6e4b58148a5b9a9ecf63d22a5fc238b5b4c7fc92387fdca483f043350217d88a2cb19de9c260e3cabaa87710c691094b0ddfaa95398e1425e7";

function decrypt(text) {
  try {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return "Error: " + e.message;
  }
}

console.log("Decrypted:", decrypt(dbString));
