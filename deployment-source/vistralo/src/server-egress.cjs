'use strict';
const net = require('node:net');
function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100&&b>=64&&b<=127) || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168 || b===0 || (b===88&&c===99))) || (a===198&&(b===18||b===19||(b===51&&c===100))) || (a===203&&b===0&&c===113));
  }
  // Only globally routed IPv6; exclude documentation and special-purpose ranges.
  if(net.isIP(address)===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:0*:|0?db8:|[01][0-9a-f]{0,2}:)/i.test(address)&&!/^2002:/i.test(address);
  return false;
}
module.exports={publicAddress};
