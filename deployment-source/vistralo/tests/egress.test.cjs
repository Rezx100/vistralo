'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {publicAddress}=require('../src/server-egress.cjs');

test('website capture only reaches public addresses',()=>{
  for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.2','169.254.169.254','100.64.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.1.2.3','::1','::ffff:127.0.0.1','fd00::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('1.1.1.1'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
