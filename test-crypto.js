const { mnemonicToPrivateKey } = require("@ton/crypto");

async function run() {
  try {
    const keyPair = await mnemonicToPrivateKey(["garbage"]);
    console.log("Success!", keyPair.publicKey.toString("hex"));
  } catch (e) {
    console.log("Error generated:", e.message);
  }
}
run();
