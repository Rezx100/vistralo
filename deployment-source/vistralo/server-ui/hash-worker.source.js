const CryptoJS = require('crypto-js/core');
require('crypto-js/sha256');
self.onmessage = async ({data:file}) => {
  try {
    const hasher=CryptoJS.algo.SHA256.create();
    for(let offset=0;offset<file.size;offset+=1024*1024){
      const bytes=new Uint8Array(await file.slice(offset,offset+1024*1024).arrayBuffer()),words=[];
      for(let i=0;i<bytes.length;i++)words[i>>>2]=(words[i>>>2]||0)|(bytes[i]<<(24-(i%4)*8));
      hasher.update(CryptoJS.lib.WordArray.create(words,bytes.length));
      self.postMessage({progress:Math.round(Math.min(offset+bytes.length,file.size)/file.size*100)});
    }
    self.postMessage({digest:hasher.finalize().toString()});
  }catch(error){self.postMessage({error:error.message});}
};
